import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
import { getWebUser } from "@/lib/connect/connectServer";
afterEach(() => { vi.unstubAllEnvs(); });
test("pending identity cannot approve a connected-client grant", async () => {
 vi.stubEnv("ADMISSION_REQUIRED","true");vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","http://localhost:54321");vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY","anon-fixture");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","service-fixture");
 mocks.getUser.mockResolvedValue({ data: { user: { id: "verified-user", email: "person@example.test" } }, error: null });
 mocks.rpc.mockResolvedValue({ data: { enabled: true, allowed: false }, error: null });
 const result=await getWebUser(new Request("http://localhost/api/connect/authorize/approve",{headers:{authorization:"Bearer fixture"}}));
 expect(result).toBeInstanceOf(Response);expect((result as Response).status).toBe(403);
 expect(mocks.rpc).toHaveBeenCalledWith("admission_check_user",{p_user_id:"verified-user"});
});
