import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseQaEmailList } from "@/lib/server/qaIdentityPolicy";
import { mintQaSession } from "@/lib/server/qaSession";

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

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  const testUserEmail = process.env.QA_TEST_USER_EMAIL ?? "test@2000nl.test";
  const allowedEmails = parseQaEmailList(
    process.env.QA_TEST_USER_EMAIL_ALLOWLIST ?? "test@2000nl.test"
  );
  const referenceEmails = parseQaEmailList(process.env.QA_REFERENCE_USER_EMAILS);

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase public credentials are not configured." },
      { status: 500 }
    );
  }

  if (!serviceKey) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required to generate a dev test session.",
      },
      { status: 500 }
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    // This route is a one-shot helper; never start background refresh timers.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const publicClient = createClient(supabaseUrl, supabaseAnonKey, {
    // Important: don't auto-refresh in the background, otherwise the freshly-issued
    // refresh token can get rotated/consumed before the caller stores it.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const { session } = await mintQaSession({
      admin,
      publicClient,
      requestedEmail: testUserEmail,
      allowedEmails,
      referenceEmails,
    });
    const res = NextResponse.json({ session }, { status: 200 });
    res.headers.set("cache-control", "no-store, max-age=0");
    return res;
  } catch (error) {
    return NextResponse.json(
      {
        step: "qaIdentity",
        error: error instanceof Error ? error.message : "Failed to create QA session.",
      },
      { status: 500 }
    );
  }
}
