import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { writeAdminAuditEvent } from "@/lib/admin/adminAuditRepository";
import { upsertAccessGroup } from "@/lib/admin/publicationRepository";

export async function POST(request: Request) {
  try {
    const principal = await requireAdmin(request, "publication.manage");
    const body = await request.json() as { key?: unknown; name?: unknown; memberIds?: unknown };
    if (typeof body.key !== "string" || typeof body.name !== "string" || !Array.isArray(body.memberIds) || !body.memberIds.every((id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
      return NextResponse.json({ error: "invalid_access_group" }, { status: 400 });
    }
    const result = await upsertAccessGroup(body.key, body.name, body.memberIds);
    await writeAdminAuditEvent({ operatorUserId: principal.userId, action: "dictionary.audience.updated", outcome: "success", targetType: "dictionary_access_group", targetId: result.key, requestId: principal.requestId, context: principal.clientContext });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
