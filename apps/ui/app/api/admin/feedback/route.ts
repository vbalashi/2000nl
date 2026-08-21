import { NextRequest } from "next/server";
import { isFeedbackAdmin, parseAdminFeedbackFilters } from "@/lib/feedback/diagnosticReportService";
import { getAuthenticatedSupabase, getPlatformServiceSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party" || !isFeedbackAdmin(auth)) {
    return jsonNoStore({ error: "admin_required" }, 403);
  }
  const filters = parseAdminFeedbackFilters(request.nextUrl);
  if (!filters.ok) return jsonNoStore({ error: filters.error }, 400);
  const service = getPlatformServiceSupabase();
  if (service instanceof Response) return service;
  const { data, error } = await service.supabase.rpc("query_feedback_items_admin", filters.value);
  if (error) return jsonNoStore({ error: "feedback_query_failed" }, 500);
  return jsonNoStore({ items: data ?? [] });
}
