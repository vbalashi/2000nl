import "server-only";

import { NextResponse } from "next/server";
import { createAdminAuthClient } from "@/lib/admin/adminServerClient";

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
    if (!payload || typeof payload !== "object" || (payload.email !== undefined && typeof payload.email !== "string")) throw new Error("Invalid payload");
    if (typeof payload.email === "string") email = payload.email.trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  // Authorize the verified Google identity in the callback, never a supplied email.
  try {
    const auth = await createAdminAuthClient();
    const redirectTo = new URL("/api/admin/auth/callback", expectedOrigin).toString();
    const { data, error: oauthError } = await auth.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account", ...(email ? { login_hint: email } : {}) },
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
