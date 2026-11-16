import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { createAdminServiceClient } from "@/lib/admin/adminServerClient";
import { writeAdminAuditEvent } from "@/lib/admin/adminAuditRepository";
export const dynamic = "force-dynamic";
export async function GET(request: Request, {params}:{params:Promise<{id:string}>}) {
  try {
    const principal = await requireAdmin(request, "feedback.read"); const {id} = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({error:"invalid_id"},{status:400});
    try {
      const {data,error} = await createAdminServiceClient().from("feedback_items").select("id,report_id,created_at,kind,problem_type,status,target,source_client,app_build_version,comment_present,diagnostic_envelopes(canonical_payload,expires_at)").eq("id",id).maybeSingle();
      if(error) throw new Error("query failed");
      await writeAdminAuditEvent({operatorUserId:principal.userId,action:"feedback.detail.read",outcome:"success",targetType:"feedback",targetId:id,requestId:principal.requestId,context:principal.clientContext});
      return NextResponse.json({item:data},{status:data?200:404,headers:{"Cache-Control":"private, no-store, max-age=0",Vary:"Cookie"}});
    } catch(error) { await writeAdminAuditEvent({operatorUserId:principal.userId,action:"feedback.detail.read",outcome:"failure",targetType:"feedback",targetId:id,requestId:principal.requestId,context:principal.clientContext}); throw error; }
  } catch(error) { return adminErrorResponse(error); }
}
