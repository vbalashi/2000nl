import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { createAdminServiceClient } from "@/lib/admin/adminServerClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdmin(request, "users.read");
    const { id } = await context.params;
    if (!UUID.test(id)) return reply({ error: "not_found" }, 404);

    const { data, error } = await createAdminServiceClient().rpc("admin_user_access_details_v1", {
      p_operator: principal.userId, p_user: id, p_request: principal.requestId,
    });
    if (error || !data) return reply({ error: "unavailable" }, 503);
    if (data.error === "forbidden") return reply({ error: "forbidden" }, 403);
    if (data.error === "not_found") return reply({ error: "not_found" }, 404);

    const { assignedGroups, operatorPermissions, history } = data;
    if (!Array.isArray(assignedGroups) || !Array.isArray(operatorPermissions) || (history !== null && !Array.isArray(history))) {
      return reply({ error: "unavailable" }, 503);
    }
    return reply({
      assignedGroups: assignedGroups.map(({ id, name, description }) => ({ id, name, description })),
      operatorPermissions: operatorPermissions.filter(permission => typeof permission === "string"),
      history: principal.permissions.includes("audit.read") && history
        ? history.map(({ at, action, operatorId, groupName }: Record<string, unknown>) => ({
          at, action, operatorId, ...(typeof groupName === "string" ? { groupName } : {}),
        })) : null,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
