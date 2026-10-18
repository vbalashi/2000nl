import crypto from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { encryptNativeSession, decryptNativeSession } from "@/lib/connect/sessionCredentials";
const createClient = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient }));
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const native = { access_token: "native-secret-access", refresh_token: "native-secret-refresh", expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: "bearer", user: { id: "user-1", email: "fixture@example.test" } };
let rows: Record<string, any[]>;
let failClaim: boolean;
let failFinalize: boolean;
const issue = vi.fn(async () => ({ data: { session: native }, error: null }));
const refresh = vi.fn(async () => ({ data: { session: native }, error: null }));
let insert: ReturnType<typeof vi.fn>;
function table(name: string) {
  let mutation: any;
  const filters: Array<(row: any) => boolean> = [];
  const result = () => {
    if (mutation && ((failClaim && name === "connect_authorization_codes") || (failFinalize && mutation.native_session_ciphertext))) return { data: null, error: { message: "fixture write error" } };
    const matches = (rows[name] ?? []).filter((row) => filters.every((filter) => filter(row)));
    if (mutation) matches.forEach((row) => Object.assign(row, mutation));
    return { data: matches[0] ? { ...matches[0] } : null, error: null };
  };
  const query: any = {
    select: () => query,
    eq: (key: string, value: any) => { filters.push((row) => row[key] === value); return query; },
    is: (key: string, value: any) => { filters.push((row) => (row[key] ?? null) === value); return query; },
    gt: (key: string, value: any) => { filters.push((row) => row[key] > value); return query; },
    update: (value: any) => { mutation = value; return query; },
    maybeSingle: async () => result(),
    then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
    insert: (row: any) => { insert(row); (rows[name] ??= []).push(row); return Promise.resolve({ error: null }); },
  };
  return query;
}
function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/connect/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: "fixture-client", ...body }) });
}
const exchange = () => request({ grant_type: "authorization_code", code: "code", redirect_uri: "https://fixture.test/", code_verifier: "verifier" });
const renew = () => request({ grant_type: "refresh_token", refresh_token: "nlc_r_fixture" });

describe("Connect security invariants", () => {
  beforeEach(() => {
    vi.resetModules(); createClient.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://unreachable.invalid";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service";
    process.env.CONNECT_SESSION_ENCRYPTION_KEY = "22".repeat(32);
    process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP = "1";
    failClaim = false; failFinalize = false;
    issue.mockReset().mockResolvedValue({ data: { session: native }, error: null });
    refresh.mockReset().mockResolvedValue({ data: { session: native }, error: null });
    insert = vi.fn();
    const scopes = ["platform:read", "offline_access"];
    rows = {
      connected_clients: [{ client_id: "fixture-client", client_type: "chrome_extension", status: "active", allowed_redirect_uris: ["https://fixture.test/"], allowed_scopes: [...scopes, "platform:write"] }],
      connected_client_grants: [{ client_id: "fixture-client", user_id: "user-1", scopes, revoked_at: null }],
      connect_authorization_codes: [{ code_hash: hash("code"), client_id: "fixture-client", user_id: "user-1", user_email: "fixture@example.test", redirect_uri: "https://fixture.test/", scopes, code_challenge: crypto.createHash("sha256").update("verifier").digest("base64url"), code_challenge_method: "S256", used_at: null, expires_at: new Date(Date.now()+60_000).toISOString() }],
      connected_client_sessions: [{ id: "session-1", client_id: "fixture-client", user_id: "user-1", credential_version: 2, scopes, revoked_at: null, refresh_claim_id: null, refresh_token_hash: hash("nlc_r_fixture"), access_token_hash: hash("nlc_a_fixture"), access_token_expires_at: new Date(Date.now()+60_000).toISOString(), refresh_token_expires_at: new Date(Date.now()+60_000).toISOString(), native_session_ciphertext: encryptNativeSession(native, "session-1", "user-1", "fixture-client") }],
    };
    createClient.mockImplementation((_url: string, key: string) => key === "fixture-service" ? { from: table, auth: { admin: { generateLink: async () => ({ data: { properties: { email_otp: "fixture" } }, error: null }) } } } : { auth: { verifyOtp: issue, refreshSession: refresh, getUser: async () => ({ data: { user: native.user }, error: null }) } });
  });

  test("only one concurrent exchange issues a native session", async () => {
    const { POST } = await import("@/app/api/connect/token/route");
    const responses = await Promise.all([POST(exchange()), POST(exchange())]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(issue).toHaveBeenCalledTimes(1);
    const payload = await responses.find((r) => r.status === 200)!.json();
    expect(JSON.stringify(payload)).not.toContain("native-secret");
    expect(payload.access_token).toMatch(/^nlc_a_/);
  });
  test("failed code claim does not call Auth", async () => {
    failClaim = true;
    const { POST } = await import("@/app/api/connect/token/route");
    expect((await POST(exchange())).status).toBe(500);
    expect(issue).not.toHaveBeenCalled();
  });
  test("without offline_access no refresh credential is returned or accepted", async () => {
    rows.connect_authorization_codes[0].scopes = ["platform:read"];
    rows.connected_client_sessions[0].scopes = ["platform:read"];
    const { POST } = await import("@/app/api/connect/token/route");
    expect(await (await POST(exchange())).json()).not.toHaveProperty("refresh_token");
    expect((await POST(renew())).status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });
  test("only one concurrent refresh reaches Auth and old opaque access stays invalid", async () => {
    const { POST } = await import("@/app/api/connect/token/route");
    const responses = await Promise.all([POST(renew()), POST(renew())]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({ refresh_token: "native-secret-refresh" });
    const { getAuthenticatedSupabase } = await import("@/lib/platform/serverSupabase");
    const old = await getAuthenticatedSupabase(new Request("http://localhost", { headers: { authorization: "Bearer nlc_a_fixture" } }));
    expect((old as Response).status).toBe(401);
  });
  test("refresh finalization error exposes no credentials and burns refresh", async () => {
    failFinalize = true;
    const { POST } = await import("@/app/api/connect/token/route");
    const response = await POST(renew());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_refresh_token" });
    expect((await POST(renew())).status).toBe(401);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  test("revoke during native refresh cannot be undone", async () => {
    refresh.mockImplementationOnce(async () => {
      rows.connected_client_sessions[0].revoked_at = new Date().toISOString();
      return { data: { session: native }, error: null };
    });
    const { POST } = await import("@/app/api/connect/token/route");
    expect((await POST(renew())).status).toBe(401);
    expect(rows.connected_client_sessions[0].revoked_at).toBeTruthy();
    expect(rows.connected_client_sessions[0].access_token_hash).toBe(hash("nlc_a_fixture"));
  });
  test.each(["revoked", "disabled", "expired"])("%s session is rejected", async (kind) => {
    if (kind === "revoked") rows.connected_client_grants[0].revoked_at = new Date().toISOString();
    if (kind === "disabled") rows.connected_clients[0].status = "disabled";
    if (kind === "expired") rows.connected_client_sessions[0].access_token_expires_at = new Date(Date.now()-1000).toISOString();
    const { getAuthenticatedSupabase } = await import("@/lib/platform/serverSupabase");
    const auth = await getAuthenticatedSupabase(new Request("http://localhost", { headers: { authorization: "Bearer nlc_a_fixture" } }));
    expect((auth as Response).status).toBe(401);
  });
  test("opaque read principal preserves user but denies write and native-only endpoints", async () => {
    const { getAuthenticatedSupabase, getAuthenticatedUserSupabase, requirePlatformScope } = await import("@/lib/platform/serverSupabase");
    const req = new Request("http://localhost", { headers: { authorization: "Bearer nlc_a_fixture" } });
    const auth = await getAuthenticatedSupabase(req);
    expect(auth).not.toBeInstanceOf(Response);
    if (auth instanceof Response) throw new Error("unexpected failure");
    expect(auth.user.id).toBe("user-1");
    expect(auth.principal.authKind).toBe("connected_client");
    expect(requirePlatformScope(auth, "platform:write")?.status).toBe(403);
    expect((await getAuthenticatedUserSupabase(req) as Response).status).toBe(403);
  });
  test("legacy tracked native connected credential cannot approve consent", async () => {
    rows.connected_client_sessions[0].access_token_hash = hash("legacy-native");
    const { getWebUser } = await import("@/lib/connect/connectServer");
    const result = await getWebUser(new Request("http://localhost", { headers: { authorization: "Bearer legacy-native" } }));
    expect((result as Response).status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });
  test("approve route rejects opaque consent before any mutation", async () => {
    const { POST } = await import("@/app/api/connect/authorize/approve/route");
    const response = await POST(new NextRequest("http://localhost/api/connect/authorize/approve", { method: "POST", headers: { authorization: "Bearer nlc_a_fixture", "content-type": "application/json" }, body: JSON.stringify({ clientId: "fixture-client", scope: "platform:write" }) }));
    expect(response.status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
    expect(rows.connected_client_grants[0].scopes).toEqual(["platform:read", "offline_access"]);
  });
  test("refresh provider exception is terminal and never retries native refresh", async () => {
    refresh.mockRejectedValueOnce(new Error("fixture provider unavailable"));
    const { POST } = await import("@/app/api/connect/token/route");
    expect(await (await POST(renew())).json()).toEqual({ error: "invalid_refresh_token" });
    expect((await POST(renew())).status).toBe(401);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  test("first-party web authentication continues to work", async () => {
    const { getWebUser } = await import("@/lib/connect/connectServer");
    expect(await getWebUser(new Request("http://localhost", { headers: { authorization: "Bearer native-web" } }))).toEqual(native.user);
  });
  test("missing key fails closed before Auth issuance", async () => {
    delete process.env.CONNECT_SESSION_ENCRYPTION_KEY;
    const { POST } = await import("@/app/api/connect/token/route");
    expect((await POST(exchange())).status).toBe(503);
    expect(issue).not.toHaveBeenCalled();
  });
  test("ciphertext is bound to session/user and wrong keys fail authentication", () => {
    const ciphertext = rows.connected_client_sessions[0].native_session_ciphertext;
    expect(() => decryptNativeSession(ciphertext, "another-session", "user-1", "fixture-client")).toThrow();
    expect(() => decryptNativeSession(ciphertext, "session-1", "another-user", "fixture-client")).toThrow();
    expect(() => decryptNativeSession(ciphertext, "session-1", "user-1", "another-client")).toThrow();
    process.env.CONNECT_SESSION_ENCRYPTION_KEY = "33".repeat(32);
    expect(() => decryptNativeSession(ciphertext, "session-1", "user-1", "fixture-client")).toThrow();
  });
});
