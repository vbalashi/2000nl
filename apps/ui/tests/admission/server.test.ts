import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { checkAdmission } from "@/lib/admission/server";
import type { SupabaseClient } from "@supabase/supabase-js";
afterEach(() => { vi.unstubAllEnvs(); });
test("dedicated server denies pending, fails closed on flag/database mismatch and propagates no provider details", async () => {
  vi.stubEnv("ADMISSION_REQUIRED", "true");
  const rpc = vi.fn(); const service = { rpc } as unknown as SupabaseClient;
  rpc.mockResolvedValue({ data: { enabled: true, allowed: false }, error: null });
  expect((await checkAdmission(service, "user-a"))?.status).toBe(403);
  expect(rpc).toHaveBeenCalledWith("admission_check_user", { p_user_id: "user-a" });
  rpc.mockResolvedValue({ data: { enabled: true, allowed: true }, error: null });
  expect(await checkAdmission(service, "user-a")).toBeNull();
  for (const result of [{ data: { enabled: false, allowed: true } }, { data: null, error: { message: "private provider details" } }]) {
    rpc.mockResolvedValue(result); const denied = await checkAdmission(service, "user-a");
    expect(denied?.status).toBe(503); expect(await denied?.text()).not.toContain("private provider");
  }
});
