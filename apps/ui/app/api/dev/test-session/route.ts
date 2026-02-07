import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function devOnlyGuard(): NextResponse | null {
  // Never expose this helper in production builds/deployments.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

export async function GET(): Promise<NextResponse> {
  const guard = devOnlyGuard();
  if (guard) return guard;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const testUserEmail = process.env.TEST_USER_EMAIL;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase public credentials are not configured." },
      { status: 500 }
    );
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is required to generate a dev test session.",
      },
      { status: 500 }
    );
  }

  if (!testUserEmail) {
    return NextResponse.json(
      { error: "TEST_USER_EMAIL is not configured." },
      { status: 500 }
    );
  }

  // 1) Generate an OTP (server-side) without sending an email.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    // This route is a one-shot helper; never start background refresh timers.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const linkRes = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: testUserEmail,
  });

  if (linkRes.error || !linkRes.data?.properties?.email_otp) {
    return NextResponse.json(
      {
        step: "generateLink",
        error: linkRes.error?.message ?? "Failed to generate OTP.",
        status: (linkRes.error as any)?.status ?? null,
      },
      { status: 500 }
    );
  }

  // 2) Exchange the generated link token for a real Supabase session (valid JWT).
  const publicClient = createClient(supabaseUrl, supabaseAnonKey, {
    // Important: don't auto-refresh in the background, otherwise the freshly-issued
    // refresh token can get rotated/consumed before the caller stores it.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Admin `generateLink({ type: "magiclink" })` also returns a short `email_otp`.
  // In Supabase "Email OTP" mode, that OTP is verified with `type: "email"` to mint
  // a real session (valid JWT + refresh token).
  const verifyRes = await publicClient.auth.verifyOtp({
    email: testUserEmail,
    token: linkRes.data.properties.email_otp,
    type: "email",
  });

  if (verifyRes.error || !verifyRes.data?.session) {
    return NextResponse.json(
      {
        step: "verifyOtp",
        error: verifyRes.error?.message ?? "Failed to verify OTP.",
        status: (verifyRes.error as any)?.status ?? null,
      },
      { status: 500 }
    );
  }

  const res = NextResponse.json(
    { session: verifyRes.data.session },
    { status: 200 }
  );
  res.headers.set("cache-control", "no-store, max-age=0");
  return res;
}
