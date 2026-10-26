import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const ADMIN_AUTH_COOKIE = "2000nl-admin-auth";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function supabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Admin authentication is not configured");
  return { url, key };
}

export async function createAdminAuthClient() {
  const { url, key } = supabaseConfig();
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";
  return createServerClient(url, key, {
    auth: {
      flowType: "pkce",
      storageKey: ADMIN_AUTH_COOKIE,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    cookieOptions: {
      name: ADMIN_AUTH_COOKIE,
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
      sameSite: "lax",
      secure,
      httpOnly: true,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(values) {
        for (const { name, value, options } of values) {
          cookieStore.set(name, value, {
            ...options,
            path: "/",
            maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
            sameSite: "lax",
            secure,
            httpOnly: true,
          });
        }
      },
    },
  });
}

export function createAdminServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Admin data access is not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

/** Clear only administrative cookies, including SDK chunks and PKCE state. */
export async function clearAdminAuthCookies() {
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (name === ADMIN_AUTH_COOKIE || name.startsWith(`${ADMIN_AUTH_COOKIE}.`) || name.startsWith(`${ADMIN_AUTH_COOKIE}-code-verifier`)) {
      store.set(name, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    }
  }
}
