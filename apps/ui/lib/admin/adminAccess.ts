import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminServiceClient, createAdminAuthClient } from "./adminServerClient";
import {
  readAdminAuditContext,
  writeAdminAuditEvent,
} from "./adminAuditRepository";

export type AdminPermission = "dictionaries.read" | "audit.read";

export class AdminAccessError extends Error {
  constructor(
    readonly status: 401 | 403 | 503,
    readonly code: "unauthorized" | "forbidden" | "unavailable",
  ) {
    super(code);
  }
}

export type AdminPrincipal = {
  userId: string;
  email: string;
  permissions: AdminPermission[];
  requestId: string;
  clientContext: ReturnType<typeof readAdminAuditContext>;
};

function sessionIdFromVerifiedJwt(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      session_id?: unknown;
    };
    return typeof claims.session_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claims.session_id)
      ? claims.session_id
      : null;
  } catch {
    return null;
  }
}

async function auditDenied(request: Request, userId: string | null, action: "access.denied" | "auth.sign_in_denied" = "access.denied") {
  await writeAdminAuditEvent({
    operatorUserId: userId,
    action,
    outcome: "denied",
    targetType: "request",
    targetId: new URL(request.url).pathname,
    context: readAdminAuditContext(request.headers),
  });
}

export async function requireAdmin(request: Request, permission?: AdminPermission): Promise<AdminPrincipal> {
  let auth;
  try {
    auth = await createAdminAuthClient();
  } catch {
    throw new AdminAccessError(503, "unavailable");
  }

  const { data: sessionData, error: sessionError } = await auth.auth.getSession();
  const session = sessionData.session;
  if (sessionError || !session?.access_token) {
    try {
      await auditDenied(request, null);
    } catch {
      throw new AdminAccessError(503, "unavailable");
    }
    throw new AdminAccessError(401, "unauthorized");
  }

  const { data: verified, error: userError } = await auth.auth.getUser(session.access_token);
  const user = verified.user;
  const context = readAdminAuditContext(request.headers);
  if (userError || !user?.id || !user.email || !user.email_confirmed_at) {
    try {
      await auditDenied(request, null, "auth.sign_in_denied");
    } catch {
      throw new AdminAccessError(503, "unavailable");
    }
    throw new AdminAccessError(401, "unauthorized");
  }

  const sessionId = sessionIdFromVerifiedJwt(session.access_token);
  if (!sessionId) {
    try {
      await auditDenied(request, user.id);
    } catch {
      throw new AdminAccessError(503, "unavailable");
    }
    throw new AdminAccessError(401, "unauthorized");
  }

  try {
    const service = createAdminServiceClient();
    const [{ data: operator, error: operatorError }, { data: activeSession, error: activeSessionError }] = await Promise.all([
      service.from("admin_operators").select("email,user_id,is_active,permissions").eq("user_id", user.id).maybeSingle(),
      service.from("admin_operator_sessions").select("auth_session_id").eq("auth_session_id", sessionId).eq("operator_user_id", user.id).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle(),
    ]);
    if (operatorError || activeSessionError) throw new Error("Admin authorization lookup failed");
    if (!operator || !operator.is_active || operator.email !== user.email.toLowerCase() || !activeSession) {
      await writeAdminAuditEvent({
        operatorUserId: user.id,
        action: "access.denied",
        outcome: "denied",
        targetType: "request",
        targetId: new URL(request.url).pathname,
        context,
      });
      throw new AdminAccessError(403, "forbidden");
    }
    const permissions = Array.isArray(operator.permissions)
      ? operator.permissions.filter((value): value is AdminPermission => value === "dictionaries.read" || value === "audit.read")
      : [];
    if (permissions.length === 0 || (permission && !permissions.includes(permission))) {
      await writeAdminAuditEvent({
        operatorUserId: user.id,
        action: "access.denied",
        outcome: "denied",
        targetType: "request",
        targetId: new URL(request.url).pathname,
        context,
      });
      throw new AdminAccessError(403, "forbidden");
    }
    return {
      userId: user.id,
      email: user.email.toLowerCase(),
      permissions,
      requestId: randomUUID(),
      clientContext: context,
    };
  } catch (error) {
    if (error instanceof AdminAccessError) throw error;
    throw new AdminAccessError(503, "unavailable");
  }
}

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminAccessError) {
    return NextResponse.json({ error: error.code }, {
      status: error.status,
      headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
    });
  }
  return NextResponse.json({ error: "unavailable" }, {
    status: 503,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
  });
}
