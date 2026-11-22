import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { createAdminServiceClient } from "@/lib/admin/adminServerClient";
import { isCalendarDate, projectLearningOverview, projectLearningSessions } from "@/lib/admin/learningOverviewContract";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LANGUAGE = /^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/;
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdmin(request, "users.read");
    const { id } = await context.params;
    if (!UUID.test(id)) return reply({ error: "not_found" }, 404);

    const params = new URL(request.url).searchParams;
    const language = params.get("language");
    const day = params.get("day");
    if ((language !== null && (language.length > 35 || !LANGUAGE.test(language))) ||
        (day !== null && !isCalendarDate(day))) return reply({ error: "invalid_selection" }, 400);

    const { data, error } = await createAdminServiceClient().rpc("admin_user_learning_overview_v1", {
      p_operator: principal.userId, p_user: id, p_request: principal.requestId, p_language: language, p_day: day,
    });
    if (error || !data) return reply({ error: "unavailable" }, 503);
    if (data.error === "forbidden") return reply({ error: "forbidden" }, 403);
    if (data.error === "not_found") return reply({ error: "not_found" }, 404);
    if (data.error === "invalid_selection") return reply({ error: "invalid_selection" }, 400);

    return reply(day ? projectLearningSessions(data) : projectLearningOverview(data));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
