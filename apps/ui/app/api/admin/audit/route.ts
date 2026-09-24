import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { readAdminAuditEvents, writeAdminAuditEvent } from "@/lib/admin/adminAuditRepository";
import type { AdminAuditAction } from "@/lib/admin/auditContract";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const JOURNAL_ACTIONS = [
  "auth.sign_in",
  "auth.sign_in_denied",
  "auth.sign_out",
  "access.denied",
  "dictionary.registry.read",
  "dictionary.metadata.read",
  "audit.journal.read",
] as const satisfies readonly AdminAuditAction[];
const PAGE_SIZES = [25, 50, 100] as const;
const PERIOD_DAYS = [7, 30, 90, 365] as const;

export async function GET(request: Request) {
  try {
    const principal = await requireAdmin(request, "audit.read");
    const params = new URL(request.url).searchParams;
    const rawAction = params.get("action") ?? "";
    const rawPage = Number(params.get("page"));
    const rawPageSize = Number(params.get("pageSize"));
    const rawPeriod = Number(params.get("period"));
    const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10_000) : 1;
    const pageSize = PAGE_SIZES.includes(rawPageSize as (typeof PAGE_SIZES)[number])
      ? rawPageSize as (typeof PAGE_SIZES)[number]
      : 25;
    const action = JOURNAL_ACTIONS.includes(rawAction as AdminAuditAction)
      ? rawAction as AdminAuditAction
      : undefined;
    const period = PERIOD_DAYS.includes(rawPeriod as (typeof PERIOD_DAYS)[number]) ? rawPeriod : 30;
    const requestedBefore = Date.parse(params.get("before") ?? "");
    const now = Date.now();
    const before = new Date(Number.isFinite(requestedBefore) && requestedBefore <= now ? requestedBefore : now).toISOString();
    const since = new Date(Date.parse(before) - period * 24 * 60 * 60 * 1000).toISOString();
    const pageData = await readAdminAuditEvents({ page, pageSize, action, since, before });

    await writeAdminAuditEvent({
      operatorUserId: principal.userId,
      action: "audit.journal.read",
      outcome: "success",
      targetType: "audit_journal",
      requestId: principal.requestId,
      context: principal.clientContext,
    });
    return NextResponse.json({ ...pageData, page, pageSize, period, before, action: action ?? "" }, {
      headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
