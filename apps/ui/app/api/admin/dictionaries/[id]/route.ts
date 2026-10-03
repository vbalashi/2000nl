import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { writeAdminAuditEvent } from "@/lib/admin/adminAuditRepository";
import { getAdminDictionaryMetadata } from "@/lib/admin/dictionaryRepository";
import { PUBLICATION_STATES, replaceDictionaryAudience, updateDictionaryPublication, type PublicationState } from "@/lib/admin/publicationRepository";

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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdmin(request, "publication.manage");
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const body = await request.json() as { publicationState?: unknown; groupKeys?: unknown; userIds?: unknown };
    let result: unknown;
    if (body.publicationState !== undefined) {
      if (!PUBLICATION_STATES.includes(body.publicationState as PublicationState)) return NextResponse.json({ error: "invalid_publication_state" }, { status: 400 });
      const hasGroupKeys = body.groupKeys !== undefined;
      const hasUserIds = body.userIds !== undefined;
      if (hasGroupKeys !== hasUserIds || (hasGroupKeys && (!Array.isArray(body.groupKeys) || !Array.isArray(body.userIds) || !body.groupKeys.every((v) => typeof v === "string") || !body.userIds.every((v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))))) return NextResponse.json({ error: "invalid_audience" }, { status: 400 });
      result = await updateDictionaryPublication(id, body.publicationState as PublicationState, hasGroupKeys ? body.groupKeys as string[] : undefined, hasUserIds ? body.userIds as string[] : undefined, {
        operatorUserId: principal.userId,
        requestId: principal.requestId,
        clientIp: principal.clientContext.clientIp,
        userAgent: principal.clientContext.userAgent,
      });
      if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
    } else {
      if (!Array.isArray(body.groupKeys) || !Array.isArray(body.userIds) || !body.groupKeys.every((v) => typeof v === "string") || !body.userIds.every((v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))) return NextResponse.json({ error: "invalid_audience" }, { status: 400 });
      result = await replaceDictionaryAudience(id, body.groupKeys, body.userIds, {
        operatorUserId: principal.userId,
        requestId: principal.requestId,
        clientIp: principal.clientContext.clientIp,
        userAgent: principal.clientContext.userAgent,
      });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
