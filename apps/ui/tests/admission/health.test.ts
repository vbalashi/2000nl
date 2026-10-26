import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/healthSupabase", () => ({ createHealthSupabaseClient: () => ({ rpc }) }));
import { checkAdmissionHealth } from "@/lib/admission/health";
afterEach(() => { vi.unstubAllEnvs(); });
test("deployment readiness rejects both directions of app/DB gate mismatch", async () => {
 for (const required of [true,false]) {
  vi.stubEnv("ADMISSION_REQUIRED",String(required));
  rpc.mockResolvedValue({ data: { enabled: required }, error: null }); expect((await checkAdmissionHealth()).status).toBe('ok');
  rpc.mockResolvedValue({ data: { enabled: !required }, error: null }); expect((await checkAdmissionHealth()).status).toBe('warning');
 }
 rpc.mockRejectedValue(new Error('provider private details')); expect(JSON.stringify(await checkAdmissionHealth())).not.toContain('private details');
});
