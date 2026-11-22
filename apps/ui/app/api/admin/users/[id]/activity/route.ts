import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { createAdminServiceClient } from "@/lib/admin/adminServerClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdmin(request, "users.read");
    const { id } = await context.params;
    if (!UUID.test(id)) return reply({ error: "not_found" }, 404);

    const period = new URL(request.url).searchParams.get("days") ?? "30";
    if (!["7", "30", "90"].includes(period)) return reply({ error: "invalid_period" }, 400);
    const days = Number(period);
    const { data, error } = await createAdminServiceClient().rpc("admin_user_activity", {
      p_operator: principal.userId, p_user: id, p_request: principal.requestId, p_days: days,
    });
    if (error || !data) return reply({ error: "unavailable" }, 503);
    if (data.error === "forbidden") return reply({ error: "forbidden" }, 403);
    if (data.error === "not_found") return reply({ error: "not_found" }, 404);

    const { periodStart, asOf, activeDays, sessionsStarted, sessionsCompleted, acceptedActions, lastObservedAt } = data;
    if (!isTimestamp(periodStart) || !isTimestamp(asOf) ||
        !isCount(activeDays) || activeDays > days || !isCount(sessionsStarted) ||
        !isCount(sessionsCompleted) || !isCount(acceptedActions) ||
        (lastObservedAt !== null && !isTimestamp(lastObservedAt))) {
      return reply({ error: "unavailable" }, 503);
    }
    return reply({ periodStart, asOf, activeDays, sessionsStarted, sessionsCompleted, acceptedActions, lastObservedAt });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
