import { beforeEach, describe, expect, test, vi } from "vitest";
const createClient = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient }));
describe("Connect credential boundary", () => {
  beforeEach(() => {
    vi.resetModules(); createClient.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://unreachable.invalid";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service";
    process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP = "1";
  });
  test("unknown opaque access never becomes first-party even if Auth accepts it", async () => {
    const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }) };
    const getUser = vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null }));
    createClient.mockReturnValue({ auth: { getUser }, from: () => query });
    const { getAuthenticatedSupabase } = await import("@/lib/platform/serverSupabase");
    const result = await getAuthenticatedSupabase(new Request("http://localhost", { headers: { authorization: "Bearer nlc_a_unknown" } }));
    expect(result).toBeInstanceOf(Response); expect((result as Response).status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
  });
  test("opaque bearer cannot approve consent", async () => {
    const getUser = vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null }));
    createClient.mockReturnValue({ auth: { getUser } });
    const { getWebUser } = await import("@/lib/connect/connectServer");
    const result = await getWebUser(new Request("http://localhost", { headers: { authorization: "Bearer nlc_a_read_only" } }));
    expect(result).toBeInstanceOf(Response); expect((result as Response).status).toBe(403);
    expect(getUser).not.toHaveBeenCalled();
  });
});
