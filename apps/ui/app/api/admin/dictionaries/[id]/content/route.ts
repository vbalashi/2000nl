import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { writeAdminAuditEvent } from "@/lib/admin/adminAuditRepository";
import { listAdminDictionaryContent } from "@/lib/admin/dictionaryRepository";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZES = [25, 50, 100] as const;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdmin(request, "dictionary.content.read");
    const { id } = await context.params;
    if (!UUID.test(id)) {
      return NextResponse.json({ error: "not_found" }, {
        status: 404,
        headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
      });
    }

    const params = new URL(request.url).searchParams;
    const rawPage = Number(params.get("page"));
    const rawPageSize = Number(params.get("pageSize"));
    const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10_000) : 1;
    const pageSize = PAGE_SIZES.includes(rawPageSize as (typeof PAGE_SIZES)[number])
      ? rawPageSize as (typeof PAGE_SIZES)[number]
      : 25;

    try {
      const result = await listAdminDictionaryContent({ dictionaryId: id, page, pageSize });
      await writeAdminAuditEvent({
        operatorUserId: principal.userId,
        action: "dictionary.content.read",
        outcome: "success",
        targetType: "dictionary_content",
        targetId: `${id}:page:${page}`,
        requestId: principal.requestId,
        context: principal.clientContext,
      });
      return NextResponse.json(result, {
        headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
      });
    } catch {
      await writeAdminAuditEvent({
        operatorUserId: principal.userId,
        action: "dictionary.content.read",
        outcome: "failure",
        targetType: "dictionary_content",
        targetId: `${id}:page:${page}`,
        requestId: principal.requestId,
        context: principal.clientContext,
      });
      throw new Error("Admin dictionary content is unavailable");
    }
  } catch (error) {
    return adminErrorResponse(error);
  }
}
