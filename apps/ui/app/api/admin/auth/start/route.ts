import "server-only";

import { NextResponse } from "next/server";
import { createAdminAuthClient, createAdminServiceClient } from "@/lib/admin/adminServerClient";
import { readAdminAuditContext, writeAdminAuditEvent } from "@/lib/admin/adminAuditRepository";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function siteOrigin(request: Request) {
  const configured = process.env.ADMIN_SITE_URL;
  if (configured) return new URL(configured).origin;
  if (process.env.NODE_ENV === "development") return new URL(request.url).origin;
  return null;
}

export async function POST(request: Request) {
  const expectedOrigin = siteOrigin(request);
  if (!expectedOrigin || request.headers.get("origin") !== expectedOrigin) {
    return NextResponse.json({ error: "request_rejected" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  let email = "";
  try {
    const payload = await request.json() as { email?: unknown };
    if (typeof payload.email === "string") email = payload.email.trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const context = readAdminAuditContext(request.headers);
  try {
    const service = createAdminServiceClient();
    const { data: operator, error } = await service
      .from("admin_operators")
      .select("email,user_id,is_active")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;
    if (!operator?.is_active) {
      await writeAdminAuditEvent({
        action: "auth.sign_in_denied",
        outcome: "denied",
        targetType: "operator",
        targetId: "google",
        context,
      });
      return NextResponse.json({ error: "operator_access_not_available" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (operator.user_id) {
      const { data: learnerSettings, error: learnerError } = await service
        .from("user_settings")
        .select("user_id")
        .eq("user_id", operator.user_id)
        .maybeSingle();
      if (learnerError) throw learnerError;
      if (learnerSettings) {
        await writeAdminAuditEvent({
          operatorUserId: operator.user_id,
          action: "auth.sign_in_denied",
          outcome: "denied",
          targetType: "operator",
          targetId: "google",
          context,
        });
        return NextResponse.json({ error: "operator_access_not_available" }, { status: 403, headers: { "Cache-Control": "no-store" } });
      }
    }

    const auth = await createAdminAuthClient();
    const redirectTo = new URL("/api/admin/auth/callback", expectedOrigin).toString();
    const { data, error: oauthError } = await auth.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { login_hint: email, prompt: "select_account" },
      },
    });
    if (oauthError || !data.url) throw oauthError ?? new Error("Google sign-in could not start");
    return NextResponse.json({ url: data.url }, {
      headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
    });
  } catch {
    return NextResponse.json({ error: "admin_auth_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
