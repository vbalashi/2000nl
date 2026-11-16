import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),audit:vi.fn(),from:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/admin/adminAccess",()=>({requireAdmin:mocks.requireAdmin,adminErrorResponse:()=>new Response(null,{status:403})}));
vi.mock("@/lib/admin/adminAuditRepository",()=>({writeAdminAuditEvent:mocks.audit}));
vi.mock("@/lib/admin/adminServerClient",()=>({createAdminServiceClient:()=>({from:mocks.from,rpc:mocks.rpc})}));
vi.mock("server-only",()=>({}));
const principal={userId:"operator",requestId:"request",clientContext:{clientIp:null,userAgent:null}};
describe("admin report access",()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.requireAdmin.mockResolvedValue(principal);mocks.audit.mockResolvedValue(undefined);});
 it("requires the report permission and audits a successful list",async()=>{
  mocks.rpc.mockResolvedValue({data:[],error:null});
  const {GET}=await import("@/app/api/admin/reports/route");const response=await GET(new Request("http://localhost/api/admin/reports"));
  expect(response.status).toBe(200);expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.any(Request),"feedback.read");expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({action:"feedback.registry.read",outcome:"success"}));
 });
 it("passes filters and sorting to the database",async()=>{mocks.rpc.mockResolvedValue({data:Array.from({length:26},(_,i)=>({id:String(i)})),error:null});const {GET}=await import("@/app/api/admin/reports/route");const r=await GET(new Request("http://localhost/api/admin/reports?word=Druk&comment=yes&kind=translation-quality&page=2&sort=kind&direction=asc"));expect(r.status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith("admin_feedback_review_page_v1",expect.objectContaining({p_word:"Druk",p_comment:"yes",p_page:2,p_sort:"kind",p_ascending:true}));const body=await r.json();expect(body.items).toHaveLength(25);expect(body.hasNext).toBe(true);});
 it("rejects invalid filters without querying",async()=>{const {GET}=await import("@/app/api/admin/reports/route");const r=await GET(new Request("http://localhost/api/admin/reports?from=2026-02-30"));expect(r.status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();});
 it("fails closed if the audit cannot be stored",async()=>{mocks.rpc.mockResolvedValue({data:[],error:null});mocks.audit.mockRejectedValue(new Error("audit unavailable"));const {GET}=await import("@/app/api/admin/reports/route");const r=await GET(new Request("http://localhost/api/admin/reports"));expect(r.status).toBe(403);});
 it("does not read reports when access is denied",async()=>{mocks.requireAdmin.mockRejectedValue(new Error("denied"));const {GET}=await import("@/app/api/admin/reports/route");const response=await GET(new Request("http://localhost/api/admin/reports"));expect(response.status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();});
 it("audits a detail read before returning evidence",async()=>{const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:{id:"123"},error:null})};mocks.from.mockReturnValue(query);const {GET}=await import("@/app/api/admin/reports/[id]/route");const response=await GET(new Request("http://localhost/api/admin/reports/123"),{params:Promise.resolve({id:"757b5d2f-285b-4a1f-829a-25561baed99f"})});expect(response.status).toBe(200);expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({action:"feedback.detail.read",outcome:"success"}));});
});
