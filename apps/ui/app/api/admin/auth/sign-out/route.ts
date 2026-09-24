import "server-only";

import { createAdminAuthClient, createAdminServiceClient } from "@/lib/admin/adminServerClient";
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

  const auth = await createAdminAuthClient();
  const { data: sessionData } = await auth.auth.getSession();
  const session = sessionData.session;
  let auditError = false;
  if (session?.access_token) {
    const { data: verified } = await auth.auth.getUser(session.access_token);
    const user = verified.user;
    const id = sessionId(session.access_token);
    if (user?.id && id) {
      const service = createAdminServiceClient();
      const { error: revokeError } = await service.from("admin_operator_sessions").update({ revoked_at: new Date().toISOString() }).eq("auth_session_id", id).eq("operator_user_id", user.id).is("revoked_at", null);
      if (revokeError) auditError = true;
      try {
        await writeAdminAuditEvent({
          operatorUserId: user.id,
          action: "auth.sign_out",
          outcome: "success",
          targetType: "operator",
          targetId: user.id,
          context: readAdminAuditContext(request.headers),
        });
      } catch {
        auditError = true;
      }
    }
  }
  await auth.auth.signOut({ scope: "local" });
  return NextResponse.json(auditError ? { error: "audit_unavailable" } : { ok: true }, {
    status: auditError ? 503 : 200,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
  });
}
