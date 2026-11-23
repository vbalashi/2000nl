import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { createAdminServiceClient } from "@/lib/admin/adminServerClient";
import { runtimeEnv } from "@/lib/runtime/publicConfig";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
type Context = { params: Promise<{ id: string }> };

async function handle(request: Request, context: Context, mutate: boolean) {
  try {
    if (mutate) {
      const site = runtimeEnv("ADMIN_SITE_URL") || runtimeEnv("NEXT_PUBLIC_SITE_URL");
      if (request.headers.get("origin") !== new URL(site || request.url).origin) {
        return reply({ error: "forbidden_origin" }, 403);
      }
    }
    const principal = await requireAdmin(request, mutate ? "testers.manage" : "users.read");
    if (!principal.permissions.includes("users.read")) return reply({ error: "forbidden" }, 403);
    const { id } = await context.params;
    if (!UUID.test(id)) return reply({ error: "not_found" }, 404);
    const owner = principal.permissions.includes("owner");
    let member: boolean | null = null;
    let groupId: string | null = null;
    if (mutate) {
      const body = await request.json().catch(() => null);
      if (typeof body?.member !== "boolean" || typeof body.groupId !== "string" ||
          (body.groupId !== "testers" && (!owner || !GROUP_ID.test(body.groupId)))) {
        return reply({ error: "invalid_request" }, 400);
      }
      member = body.member;
      groupId = body.groupId.toLowerCase();
    }
    const rpc = createAdminServiceClient();
    const binding = { p_operator: principal.userId, p_user: id, p_request: principal.requestId, p_member: member };
    const { data, error } = owner
      ? await rpc.rpc("admin_owner_user_access_v1", { ...binding, p_group_id: groupId })
      : await rpc.rpc("admin_user_tester_access", binding);
    if (error || !data) return reply({ error: "unavailable" }, 503);
    if (data.error === "invalid_request") return reply(data, 400);
    if (data.error === "forbidden") return reply(data, 403);
    if (data.error === "not_found") return reply(data, 404);
    if (data.error === "group_unavailable") return reply(data, 409);
    const groups: unknown = data.groups;
    if (!Array.isArray(groups) || groups.some(group =>
      (group?.id !== "testers" && (!owner || typeof group?.id !== "string" || !GROUP_ID.test(group.id))) || typeof group.name !== "string" || typeof group.member !== "boolean" ||
      (group.description !== null && typeof group.description !== "string")) || typeof data.operatorActive !== "boolean") {
      return reply({ error: "unavailable" }, 503);
    }
    return reply({ groups, operatorActive: data.operatorActive });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export const GET = (request: Request, context: Context) => handle(request, context, false);
export const POST = (request: Request, context: Context) => handle(request, context, true);
