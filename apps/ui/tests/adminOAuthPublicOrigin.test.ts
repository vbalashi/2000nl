// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { setCookie } = vi.hoisted(() => ({ setCookie: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: setCookie }),
}));

import { POST } from "@/app/api/admin/auth/start/route";
import { createAdminAuthClient, createAdminServiceClient } from "@/lib/admin/adminServerClient";

const appOrigin = "https://app.example.test";
const publicAuthOrigin = "https://auth.example.test";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected network access"); }));
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ADMIN_SITE_URL", appOrigin);
  vi.stubEnv("SUPABASE_URL", "http://supabase-internal:8000");
  vi.stubEnv("SUPABASE_ANON_KEY", "sb_publishable_fixture_anon_key");
  vi.stubEnv("PUBLIC_SUPABASE_URL", publicAuthOrigin);
  vi.stubEnv("PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_fixture_anon_key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://stale-build.example.test");
  vi.stubEnv("NEXT_PUBLIC_RUNTIME_CONFIG_REQUIRED", "true");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function start() {
  return POST(new Request(`${appOrigin}/api/admin/auth/start`, {
    method: "POST", headers: { origin: appOrigin, "content-type": "application/json" }, body: "{}",
  }));
}

it("constructs the browser OAuth URL from the public endpoint with the real PKCE SDK", async () => {
  const response = await start();
  expect(response.status).toBe(200);
  const url = new URL((await response.json()).url);
  expect(url.origin).toBe(publicAuthOrigin);
  expect(url.pathname).toBe("/auth/v1/authorize");
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("redirect_to")).toBe(`${appOrigin}/api/admin/auth/callback`);
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
  expect(setCookie).toHaveBeenCalledWith(expect.stringMatching(/^2000nl-admin-auth-code-verifier/), expect.any(String), expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax", path: "/" }));
});

it.each([undefined, "", "http://supabase-internal:8000", "https://user:password@auth.example.test", "https://auth.example.test?token=invalid", "https://auth.example.test#fragment", "javascript:alert(1)"])("fails closed before setting PKCE cookies for a missing or invalid portable public endpoint %s", async (url) => {
  if (url === undefined) delete process.env.PUBLIC_SUPABASE_URL;
  else vi.stubEnv("PUBLIC_SUPABASE_URL", url);
  const response = await start();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "admin_auth_unavailable" });
  expect(setCookie).not.toHaveBeenCalled();
});

it("rejects a privileged key assigned to browser OAuth configuration", async () => {
  vi.stubEnv("PUBLIC_SUPABASE_ANON_KEY", ["sb", "secret", "fixture_must_remain_server_only"].join("_"));
  expect((await start()).status).toBe(503);
  expect(setCookie).not.toHaveBeenCalled();
});

it("preserves legacy deployments whose server endpoint is already public", async () => {
  vi.stubEnv("NEXT_PUBLIC_RUNTIME_CONFIG_REQUIRED", "false");
  delete process.env.PUBLIC_SUPABASE_URL;
  delete process.env.PUBLIC_SUPABASE_ANON_KEY;
  vi.stubEnv("SUPABASE_URL", publicAuthOrigin);
  const response = await start();
  expect(response.status).toBe(200);
  expect(new URL((await response.json()).url).origin).toBe(publicAuthOrigin);
});

it("keeps callback authentication and service requests on the internal endpoint", async () => {
  const fetch = vi.fn(async (_input: RequestInfo | URL) => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-server-only-key");
  const auth = await createAdminAuthClient();
  await auth.auth.getUser("fixture-access-token");
  await createAdminServiceClient().from("admin_operators").select("email");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.map(([input]) => new URL(String(input)).origin)).toEqual([
    "http://supabase-internal:8000", "http://supabase-internal:8000",
  ]);
});
