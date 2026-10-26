import "server-only";

import { createAdminAuthClient, createAdminServiceClient, clearAdminAuthCookies } from "@/lib/admin/adminServerClient";
import { readAdminAuditContext, writeAdminAuditEvent } from "@/lib/admin/adminAuditRepository";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function sessionId(token: string) {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { session_id?: unknown };
    return typeof claims.session_id === "string" ? claims.session_id : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const expectedOrigin = process.env.ADMIN_SITE_URL
    ? new URL(process.env.ADMIN_SITE_URL).origin
    : process.env.NODE_ENV === "development" ? new URL(request.url).origin : null;
  if (!expectedOrigin || request.headers.get("origin") !== expectedOrigin) {
    return NextResponse.json({ error: "request_rejected" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  let auth: Awaited<ReturnType<typeof createAdminAuthClient>> | undefined;
  let incomplete = false;
  let operatorUserId: string | undefined;
  try {
    auth = await createAdminAuthClient();
    const { data: sessionData, error: sessionError } = await auth.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData.session;
    if (session?.access_token) {
      const { data: verified, error } = await auth.auth.getUser(session.access_token);
      const id = sessionId(session.access_token);
      if (error || !verified.user?.id || !id) throw new Error("Session verification unavailable");
      operatorUserId = verified.user.id;
      const { error: revokeError } = await createAdminServiceClient()
        .from("admin_operator_sessions").update({ revoked_at: new Date().toISOString() })
        .eq("auth_session_id", id).eq("operator_user_id", operatorUserId).is("revoked_at", null);
      if (revokeError) throw revokeError;
    }
  } catch {
    incomplete = true;
  } finally {
    try {
      if (auth) {
        const { error } = await auth.auth.signOut({ scope: "local" });
        if (error) incomplete = true;
      }
    } catch {
      incomplete = true;
    }
    await clearAdminAuthCookies();
  }
  try {
    await writeAdminAuditEvent({
      operatorUserId,
      action: "auth.sign_out",
      outcome: incomplete ? "failure" : "success",
      targetType: "operator",
      targetId: operatorUserId,
      context: readAdminAuditContext(request.headers),
    });
  } catch {
    incomplete = true;
  }
  return NextResponse.json(incomplete ? { error: "sign_out_incomplete" } : { ok: true }, {
    status: incomplete ? 503 : 200,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
  });
}
