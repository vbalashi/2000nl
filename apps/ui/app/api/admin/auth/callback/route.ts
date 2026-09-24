import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminAuthClient, createAdminServiceClient, ADMIN_SESSION_MAX_AGE_SECONDS } from "@/lib/admin/adminServerClient";
import { readAdminAuditContext, writeAdminAuditEvent } from "@/lib/admin/adminAuditRepository";
import { AdminAccessError } from "@/lib/admin/adminAccess";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function callbackOrigin(request: Request) {
  const configured = process.env.ADMIN_SITE_URL;
  if (configured) return new URL(configured).origin;
  return process.env.NODE_ENV === "development" ? new URL(request.url).origin : null;
}

function sessionIdFromToken(token: string) {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { session_id?: unknown };
    return typeof claims.session_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claims.session_id)
      ? claims.session_id
      : null;
  } catch {
    return null;
  }
}

function failureRedirect(request: Request) {
  const origin = callbackOrigin(request);
  const url = new URL("/admin?view=login&state=signin-error", origin ?? "http://localhost");
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET(request: Request) {
  const origin = callbackOrigin(request);
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  if (!origin || !code) return failureRedirect(request);

  const auth = await createAdminAuthClient();
  const context = readAdminAuditContext(request.headers);
  let auditRecorded = false;
  let activeSessionId: string | null = null;
  try {
    const { error: exchangeError } = await auth.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    const { data: sessionData } = await auth.auth.getSession();
    const session = sessionData.session;
    if (!session?.access_token) throw new Error("Session exchange failed");
    const { data: verified, error: userError } = await auth.auth.getUser(session.access_token);
    const user = verified.user;
    if (userError || !user?.id || !user.email || !user.email_confirmed_at) throw new Error("Verified Google identity required");
    const provider = user.app_metadata?.provider;
    const providers = Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : [];
    if (provider !== "google" && !providers.includes("google")) throw new Error("Google identity required");

    const service = createAdminServiceClient();
    const email = user.email.toLowerCase();
    const { data: operator, error: operatorError } = await service
      .from("admin_operators").select("email,user_id,is_active").eq("email", email).maybeSingle();
    if (operatorError) throw new Error("Operator lookup failed");
    if (!operator?.is_active || (operator.user_id && operator.user_id !== user.id)) {
      await writeAdminAuditEvent({
        operatorUserId: user.id,
        action: "auth.sign_in_denied",
        outcome: "denied",
        targetType: "operator",
        targetId: email,
        context,
      });
      auditRecorded = true;
      throw new AdminAccessError(403, "forbidden");
    }
    if (!operator.user_id) {
      const { data: claimed, error: claimError } = await service
        .from("admin_operators")
        .update({ user_id: user.id, updated_at: new Date().toISOString() })
        .eq("email", email)
        .is("user_id", null)
        .eq("is_active", true)
        .select("email")
        .maybeSingle();
      if (claimError || !claimed) throw new Error("Operator identity could not be bound");
    }

    const sessionId = sessionIdFromToken(session.access_token);
    if (!sessionId) throw new Error("Provider session id missing");
    activeSessionId = sessionId;
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000).toISOString();
    const { error: sessionError } = await service.from("admin_operator_sessions").insert({
      auth_session_id: sessionId,
      operator_user_id: user.id,
      expires_at: expiresAt,
    });
    if (sessionError) throw new Error("Admin session could not be registered");
    await writeAdminAuditEvent({
      operatorUserId: user.id,
      action: "auth.sign_in",
      outcome: "success",
      targetType: "operator",
      targetId: user.id,
      requestId: randomUUID(),
      context,
    });
    auditRecorded = true;

    const response = NextResponse.redirect(new URL("/admin", origin));
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch {
    if (activeSessionId) {
      try {
        await createAdminServiceClient()
          .from("admin_operator_sessions")
          .update({ revoked_at: new Date().toISOString() })
          .eq("auth_session_id", activeSessionId)
          .is("revoked_at", null);
      } catch {
        // Session expiry remains bounded even if the cleanup write is unavailable.
      }
    }
    if (!auditRecorded) {
      try {
        await writeAdminAuditEvent({
          action: "auth.sign_in_denied",
          outcome: "denied",
          targetType: "google",
          context,
        });
      } catch {
        // Keep the response generic and clear the browser's admin cookie.
      }
    }
    try {
      await auth.auth.signOut({ scope: "local" });
    } catch {
      // The response still clears the admin session cookie below.
    }
    return failureRedirect(request);
  }
}
