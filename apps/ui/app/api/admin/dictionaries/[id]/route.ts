import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { writeAdminAuditEvent } from "@/lib/admin/adminAuditRepository";
import { getAdminDictionaryMetadata } from "@/lib/admin/dictionaryRepository";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdmin(request, "dictionaries.read");
    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
    }
    const dictionary = await getAdminDictionaryMetadata(id);
    await writeAdminAuditEvent({
      operatorUserId: principal.userId,
      action: "dictionary.metadata.read",
      outcome: dictionary ? "success" : "failure",
      targetType: "dictionary",
      targetId: id,
      requestId: principal.requestId,
      context: principal.clientContext,
    });
    if (!dictionary) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
    return NextResponse.json(dictionary, { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
