import "server-only";

import { NextResponse } from "next/server";
import { createAdminAuthClient, clearAdminAuthCookies } from "@/lib/admin/adminServerClient";
import { readAdminAuditContext,writeAdminAuditEvent } from "@/lib/admin/adminAuditRepository";
import { consumeAdminReturnUrl } from "@/lib/admin/adminAuthReturn";
import { registerAdminSession } from "@/lib/admin/adminSignInSession";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function callbackOrigin(request: Request) {
  const configured = process.env.ADMIN_SITE_URL;
  if (configured) return new URL(configured).origin;
  return process.env.NODE_ENV === "development" ? new URL(request.url).origin : null;
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
  let registering=false;
  try {
    const { error } = await auth.auth.exchangeCodeForSession(code);
    if (error) throw new Error("Code exchange failed");
    registering=true;
    await registerAdminSession(request, auth, "google");
    const response = NextResponse.redirect(new URL(await consumeAdminReturnUrl(origin), origin));
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch {
    if (!registering) {
      try { await writeAdminAuditEvent({action:"auth.sign_in_denied",outcome:"denied",targetType:"google",context:readAdminAuditContext(request.headers)}); } catch { /* Never authorize when the audit is unavailable. */ }
      try { await auth.auth.signOut({ scope: "local" }); } catch { /* Clear the local cookie below. */ }
      await clearAdminAuthCookies();
    }
    return failureRedirect(request);
  }
}
