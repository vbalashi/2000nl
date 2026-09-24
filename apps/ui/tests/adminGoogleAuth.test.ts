import { beforeEach, describe, expect, it, vi } from "vitest";
const { auth, from, audit } = vi.hoisted(() => ({
  auth: { signInWithOAuth: vi.fn(), exchangeCodeForSession: vi.fn(), getSession: vi.fn(), getUser: vi.fn(), signOut: vi.fn() },
  from: vi.fn(), audit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/adminServerClient", () => ({ createAdminAuthClient: async () => ({ auth }), createAdminServiceClient: () => ({ from }), ADMIN_SESSION_MAX_AGE_SECONDS: 28800 }));
vi.mock("@/lib/admin/adminAuditRepository", () => ({ readAdminAuditContext: () => ({}), writeAdminAuditEvent: audit }));
import { POST as start } from "@/app/api/admin/auth/start/route";
import { GET as callback } from "@/app/api/admin/auth/callback/route";
import { POST as signOut } from "@/app/api/admin/auth/sign-out/route";
const origin = "https://2000.dilum.io";
const user = { id: "95b81d3e-7000-4000-8000-000000000002", email: "operator@example.test", email_confirmed_at: "2026-09-24T10:00:00Z", app_metadata: { provider: "email", providers: ["email", "google"] } };
const sessionId = "95b81d3e-7000-4000-8000-000000000001";
const token = `header.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString("base64url")}.signature`;
function query(data: unknown) {
  const q = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), update: vi.fn(), maybeSingle: vi.fn(async () => ({ data, error: null })), insert: vi.fn(async () => ({ error: null })), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
  for (const key of ["select", "eq", "is", "update"] as const) q[key].mockReturnValue(q);
  return q;
}
let operator: ReturnType<typeof query>;
let sessions: ReturnType<typeof query>;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("ADMIN_SITE_URL", origin);
  operator = query({ email: user.email, user_id: user.id, is_active: true }); sessions = query(null);
  from.mockImplementation((table: string) => {
    if (table === "admin_operators") return operator;
    if (table === "admin_operator_sessions") return sessions;
    throw new Error(`Unexpected table ${table}`);
  });
  auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/example" }, error: null });
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  auth.getSession.mockResolvedValue({ data: { session: { access_token: token } } });
  auth.getUser.mockResolvedValue({ data: { user }, error: null });
  auth.signOut.mockResolvedValue({ error: null }); audit.mockResolvedValue(undefined);
});
function post(path: string, requestOrigin = origin) {
  return new Request(`${origin}/api/admin/auth/${path}`, { method: "POST", headers: { origin: requestOrigin, "content-type": "application/json" }, body: JSON.stringify({ email: user.email }) });
}
describe("Google admin login for an existing learner identity", () => {
  it("starts Google for an allowlisted existing user without touching their learner profile", async () => {
    expect((await start(post("start"))).status).toBe(200);
    expect(auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: "google", options: expect.objectContaining({ redirectTo: `${origin}/api/admin/auth/callback` }) }));
    expect(from).not.toHaveBeenCalledWith("user_settings");
  });
  it("rejects cross-origin sign-in", async () => {
    expect((await start(post("start", "https://other.example"))).status).toBe(403);
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });
  it("rejects an identity without an active operator grant", async () => {
    operator.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await start(post("start"))).status).toBe(403);
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });
  it("accepts linked Google on the existing email identity and registers an admin session", async () => {
    const response = await callback(new Request(`${origin}/api/admin/auth/callback?code=verified-code`));
    expect(response.headers.get("location")).toBe(`${origin}/admin`);
    expect(sessions.insert).toHaveBeenCalledWith(expect.objectContaining({ auth_session_id: sessionId, operator_user_id: user.id }));
    expect(from).not.toHaveBeenCalledWith("user_settings");
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it("rejects a different identity bound to the operator email", async () => {
    operator.maybeSingle.mockResolvedValue({ data: { email: user.email, user_id: "other-user", is_active: true }, error: null });
    const response = await callback(new Request(`${origin}/api/admin/auth/callback?code=code`));
    expect(response.headers.get("location")).toContain("state=signin-error");
    expect(sessions.insert).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("cleans up a failed callback without revoking the learner session", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: new Error("invalid code") });
    await callback(new Request(`${origin}/api/admin/auth/callback?code=bad`));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(sessions.insert).not.toHaveBeenCalled();
  });
  it("signs out only the admin session for the shared identity", async () => {
    expect((await signOut(post("sign-out"))).status).toBe(200);
    expect(sessions.eq).toHaveBeenCalledWith("auth_session_id", sessionId);
    expect(sessions.eq).toHaveBeenCalledWith("operator_user_id", user.id);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
