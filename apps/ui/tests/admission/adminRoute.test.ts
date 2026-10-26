import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/admin/adminAccess", () => ({ requireAdmin: mocks.requireAdmin, adminErrorResponse: () => new Response('{}', { status: 503 }) }));
vi.mock("@/lib/admin/adminServerClient", () => ({ createAdminServiceClient: () => ({ rpc: mocks.rpc }) }));
import { POST, GET } from "@/app/api/admin/admission/route";
afterEach(() => { vi.unstubAllEnvs(); });
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://2000.example"); vi.clearAllMocks(); mocks.requireAdmin.mockResolvedValue({ userId: "verified-operator", requestId: "verified-request" }); mocks.rpc.mockResolvedValue({ data: { results: [] }, error: null }); });
function request(body: unknown, origin = "https://2000.example") { return new Request("https://2000.example/api/admin/admission", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
test("cookie mutation rejects cross-origin before touching admin/data", async () => {
 expect((await POST(request({ action: "approve", emails: ["a@example.com"] }, "https://evil.example"))).status).toBe(403);
 expect(mocks.requireAdmin).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
});
test("mutation requires admission.manage and uses only server-derived operator/request identity", async () => {
 expect((await POST(request({ action: "approve", emails: [" A@Example.com ", "a@example.com"], operator: "attacker", requestId: "attacker" }))).status).toBe(200);
 expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.any(Request), "admission.manage");
 expect(mocks.rpc).toHaveBeenCalledWith("admin_admission_mutate", { p_operator: "verified-operator", p_request_id: "verified-request", p_action: "approve", p_emails: ["a@example.com"], p_mode: null });
});
test("invalid or implicit all-user mutation never reaches DB", async () => {
 expect((await POST(request({ action: "approve", all: true }))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
 expect((await GET(new Request("https://2000.example/api/admin/admission?page=-1"))).status).toBe(400);
});

test("same-origin decision uses canonical runtime origin behind a reverse proxy", async () => {
 const req = new Request("http://ui.internal:3000/api/admin/admission", { method:"POST",headers:{origin:"https://2000.example","Content-Type":"application/json"},body:JSON.stringify({action:"approve",emails:["a@example.com"]}) });
 expect((await POST(req)).status).toBe(200);
});
