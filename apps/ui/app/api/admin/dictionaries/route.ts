import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { writeAdminAuditEvent } from "@/lib/admin/adminAuditRepository";
import { parseDictionaryFilters } from "@/lib/admin/dictionaryContract";
import { listAdminDictionaries } from "@/lib/admin/dictionaryRepository";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  try {
    const principal = await requireAdmin(request, "dictionaries.read");
    const filters = parseDictionaryFilters(new URL(request.url).searchParams);
    try {
      const page = await listAdminDictionaries(filters);
      await writeAdminAuditEvent({
        operatorUserId: principal.userId,
        action: "dictionary.registry.read",
        outcome: "success",
        targetType: "dictionary_registry",
        requestId: principal.requestId,
        context: principal.clientContext,
      });
      return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
    } catch {
      throw new Error("Admin dictionary registry is unavailable");
    }
  } catch (error) {
    return adminErrorResponse(error);
  }
}
