import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { writeAdminAuditEvent } from "@/lib/admin/adminAuditRepository";
import { parseAdminUserRegistryQuery } from "@/lib/admin/userContract";
import { listAdminUsers } from "@/lib/admin/userRepository";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  let principal;
  let page = 1;
  try {
    principal = await requireAdmin(request, "users.read");
    const query = parseAdminUserRegistryQuery(new URL(request.url).searchParams);
    page = query.page;
    try {
      const result = await listAdminUsers(query);
      await writeAdminAuditEvent({
        operatorUserId: principal.userId,
        action: "user.registry.read",
        outcome: "success",
        targetType: "user_registry",
        targetId: `page:${page}`,
        requestId: principal.requestId,
        context: principal.clientContext,
      });
      return NextResponse.json(result, {
        headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
      });
    } catch {
      await writeAdminAuditEvent({
        operatorUserId: principal.userId,
        action: "user.registry.read",
        outcome: "failure",
        targetType: "user_registry",
        targetId: `page:${page}`,
        requestId: principal.requestId,
        context: principal.clientContext,
      });
      throw new Error("Admin user registry is unavailable");
    }
  } catch (error) {
    return adminErrorResponse(error);
  }
}
