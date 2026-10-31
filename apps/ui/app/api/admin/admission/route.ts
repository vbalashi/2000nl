import { NextResponse } from "next/server";
import { runtimeEnv } from "@/lib/runtime/publicConfig";
import { requireAdmin, adminErrorResponse } from "@/lib/admin/adminAccess";
import { createAdminServiceClient } from "@/lib/admin/adminServerClient";
import { parseAdmissionMutation } from "@/lib/admission/contract";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function GET(request: Request) {
  try {
    const principal = await requireAdmin(request, "admission.manage");
    const params = new URL(request.url).searchParams;
    const page = Number(params.get("page") ?? "1");
    const status = params.get("status");
    if (!Number.isInteger(page) || page < 1 || page > 10000 || (status && !["pending", "approved", "rejected", "revoked"].includes(status))) return reply({ error: "invalid_query" }, 400);
    const { data, error } = await createAdminServiceClient().rpc("admin_admission_page", { p_operator: principal.userId, p_status: status || null, p_query: (params.get("q") ?? "").slice(0, 128) || null, p_page: page });
    if (error) throw new Error("Admission registry unavailable");
    return reply(data);
  } catch (error) { return adminErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    // Cookie-authenticated mutations must originate from this admin origin.
    const site = runtimeEnv("ADMIN_SITE_URL") || runtimeEnv("NEXT_PUBLIC_SITE_URL");
    const expectedOrigin = new URL(site || request.url).origin;
    if (request.headers.get("origin") !== expectedOrigin) return reply({ error: "forbidden_origin" }, 403);
    const principal = await requireAdmin(request, "admission.manage");
    let body: unknown;
    try { body = await request.json(); } catch { return reply({ error: "invalid_request" }, 400); }
    const input = parseAdmissionMutation(body);
    if (!input) return reply({ error: "invalid_request" }, 400);
    const { data, error } = await createAdminServiceClient().rpc("admin_admission_mutate", { p_operator: principal.userId, p_action: input.action, p_emails: input.emails, p_mode: input.mode, p_request_id: principal.requestId });
    if (error) throw new Error("Admission decision unavailable");
    return reply(data);
  } catch (error) { return adminErrorResponse(error); }
}
