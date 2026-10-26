import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { writeAdminAuditEvent } from "@/lib/admin/adminAuditRepository";
import { getAdminUser } from "@/lib/admin/userRepository";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdmin(request, "users.read");
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "not_found" }, {
      status: 404,
      headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
    });

    try {
      const user = await getAdminUser(id);
      if (!user) {
        await writeAdminAuditEvent({
          operatorUserId: principal.userId,
          action: "user.profile.read",
          outcome: "failure",
          targetType: "user_profile",
          targetId: id,
          requestId: principal.requestId,
          context: principal.clientContext,
        });
        return NextResponse.json({ error: "not_found" }, {
          status: 404,
          headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
        });
      }
      await writeAdminAuditEvent({
        operatorUserId: principal.userId,
        action: "user.profile.read",
        outcome: "success",
        targetType: "user_profile",
        targetId: id,
        requestId: principal.requestId,
        context: principal.clientContext,
      });
      return NextResponse.json(user, {
        headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
      });
    } catch {
      await writeAdminAuditEvent({
        operatorUserId: principal.userId,
        action: "user.profile.read",
        outcome: "failure",
        targetType: "user_profile",
        targetId: id,
        requestId: principal.requestId,
        context: principal.clientContext,
      });
      return NextResponse.json({ error: "unavailable" }, {
        status: 503,
        headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
      });
    }
  } catch (error) {
    return adminErrorResponse(error);
  }
}
