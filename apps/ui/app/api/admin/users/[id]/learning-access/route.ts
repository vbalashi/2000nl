import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { createAdminServiceClient } from "@/lib/admin/adminServerClient";
import { sandboxFulfillmentEnabled } from "@/lib/billing/paddleSandboxWebhook";
import { runtimeEnv } from "@/lib/runtime/publicConfig";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const errorStatuses = {
  invalid_request: 400,
  forbidden: 403,
  not_found: 404,
  request_conflict: 409,
  group_unavailable: 409,
} as const;
type Context = { params: Promise<{ id: string }> };

const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
const isUUID = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

function rpcFailure(data: { error?: unknown } | null, error: unknown) {
  if (error || !data) return reply({ error: "unavailable" }, 503);
  const code = data.error;
  if (typeof code === "string" && Object.hasOwn(errorStatuses, code)) {
    return reply({ error: code }, errorStatuses[code as keyof typeof errorStatuses]);
  }
  return undefined;
}

export async function GET(request: Request, context: Context) {
  try {
    const principal = await requireAdmin(request, "users.read");
    const { id } = await context.params;
    if (!isUUID(id)) return reply({ error: "not_found" }, 404);

    const { data, error } = await createAdminServiceClient().rpc("admin_assistant_allowances_v1", {
      p_operator: principal.userId,
      p_user: id,
      p_request: principal.requestId,
      p_allow_sandbox: sandboxFulfillmentEnabled(process.env),
    });
    const failure = rpcFailure(data, error);
    if (failure) return failure;
    const { premium, manualUntil, aiRepliesRemaining, dictationsRemaining, groups } = data;
    if (typeof premium !== "boolean" || !(manualUntil === null || isDate(manualUntil)) ||
        !isCount(aiRepliesRemaining) || !isCount(dictationsRemaining) || !Array.isArray(groups) ||
        groups.some(group => !isUUID(group?.id) || typeof group.name !== "string")) {
      return reply({ error: "unavailable" }, 503);
    }
    return reply({
      premium, manualUntil, aiRepliesRemaining, dictationsRemaining,
      groups: groups.map(({ id, name }) => ({ id, name })),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const site = runtimeEnv("ADMIN_SITE_URL") || runtimeEnv("NEXT_PUBLIC_SITE_URL");
    if (request.headers.get("origin") !== new URL(site || request.url).origin) {
      return reply({ error: "forbidden_origin" }, 403);
    }

    const principal = await requireAdmin(request, "users.read");
    if (!principal.permissions.includes("owner") && !principal.permissions.includes("entitlements.manage")) {
      return reply({ error: "forbidden" }, 403);
    }
    const { id } = await context.params;
    if (!isUUID(id)) return reply({ error: "not_found" }, 404);

    const body = await request.json().catch(() => null);
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!isUUID(body?.requestId) || !reason || reason.length > 500) return reply({ error: "invalid_request" }, 400);

    const rpc = createAdminServiceClient();
    const args = { p_operator: principal.userId, p_request: body.requestId, p_reason: reason };

    if (body.action === "credit") {
      const { groupId = null, aiReplies, dictations } = body;
      if (!(groupId === null || isUUID(groupId)) || !isCount(aiReplies) || aiReplies > 10_000 ||
          !isCount(dictations) || dictations > 10_000 || (aiReplies === 0 && dictations === 0)) {
        return reply({ error: "invalid_request" }, 400);
      }
      const { data, error } = await rpc.rpc("admin_grant_assistant_allowance_v1", {
        ...args, p_user: groupId === null ? id : null, p_group: groupId, p_ai_replies: aiReplies, p_dictations: dictations,
      });
      const failure = rpcFailure(data, error);
      if (failure) return failure;
      return isCount(data.grantedUsers) && typeof data.replayed === "boolean"
        ? reply({ grantedUsers: data.grantedUsers, replayed: data.replayed })
        : reply({ error: "unavailable" }, 503);
    }

    if (body.action === "grantPremium" && isDate(body.validUntil) && TIMESTAMP.test(body.validUntil)) {
      const { data, error } = await rpc.rpc("admin_grant_manual_premium_v1", {
        ...args, p_user: id, p_valid_until: body.validUntil,
      });
      const failure = rpcFailure(data, error);
      if (failure) return failure;
      return isDate(data.manualUntil) && typeof data.replayed === "boolean"
        ? reply({ manualUntil: data.manualUntil, replayed: data.replayed })
        : reply({ error: "unavailable" }, 503);
    }
    return reply({ error: "invalid_request" }, 400);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
