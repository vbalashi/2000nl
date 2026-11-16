import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { createAdminServiceClient } from "@/lib/admin/adminServerClient";
import { writeAdminAuditEvent } from "@/lib/admin/adminAuditRepository";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const principal = await requireAdmin(request, "feedback.read");
    const p = new URL(request.url).searchParams;
    const page = Number(p.get("page") || 1), sort = p.get("sort") || "created_at", direction = p.get("direction") || "desc";
    const kind = p.get("kind") || "", status = p.get("status") || "", word = (p.get("word") || "").trim(), comment = p.get("comment") || "all";
    const from = p.get("from") || "", to = p.get("to") || "";
    const validDate = (v:string) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v));
    if (!Number.isInteger(page) || page < 1 || page > 10000 || !["created_at", "kind", "status"].includes(sort) || !["asc","desc"].includes(direction) || !["all","yes","no"].includes(comment) || word.length > 100 || (kind && !["content-quality", "translation-quality", "rendering", "loading", "training-action", "other"].includes(kind)) || (status && !["new", "triaged", "linked-to-github", "fixed", "ignored"].includes(status)) || !validDate(from) || !validDate(to) || (from && to && from > to)) return NextResponse.json({error:"invalid_filter"},{status:400});
    try {
      const {data,error} = await createAdminServiceClient().rpc("admin_feedback_review_page_v1",{p_kind:kind,p_status:status,p_from:from?`${from}T00:00:00Z`:null,p_to:to?new Date(Date.parse(`${to}T00:00:00Z`)+86400000).toISOString():null,p_word:word,p_comment:comment,p_sort:sort,p_ascending:direction==="asc",p_page:page});
      if (error || !Array.isArray(data)) throw new Error("query failed");
      const items = data.slice(0,25).map(row=>({id:row.id,reportId:row.report_id,createdAt:row.created_at,kind:row.kind,problemType:row.problem_type,status:row.status,commentPresent:row.comment_present,comment:row.comment,word:row.word,expiresAt:row.expires_at}));
      await writeAdminAuditEvent({operatorUserId:principal.userId,action:"feedback.registry.read",outcome:"success",targetType:"feedback_registry",targetId:`page:${page}`,requestId:principal.requestId,context:principal.clientContext});
      return NextResponse.json({items,hasNext:data.length>25,page},{headers:{"Cache-Control":"private, no-store, max-age=0",Vary:"Cookie"}});
    } catch (error) { await writeAdminAuditEvent({operatorUserId:principal.userId,action:"feedback.registry.read",outcome:"failure",targetType:"feedback_registry",targetId:`page:${page}`,requestId:principal.requestId,context:principal.clientContext}); throw error; }
  } catch (error) { return adminErrorResponse(error); }
}
