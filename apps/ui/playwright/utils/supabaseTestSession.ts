import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

type TestUser = {
  id: string;
  email: string;
};

const base64UrlEncode = (input: string): string =>
  Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const makeFakeJwt = (payload: Record<string, unknown>): string => {
  // auth-js's decodeJWT only decodes; it does not validate signatures here.
  const header = { alg: "HS256", typ: "JWT" };
  return `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload)
  )}.signature`;
};

export function buildFakeSupabaseSession(user: TestUser): Session {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresIn = 60 * 60; // 1h
  const expiresAt = nowSeconds + expiresIn;

  const accessToken = makeFakeJwt({
    aud: "authenticated",
    exp: expiresAt,
    iat: nowSeconds,
    sub: user.id,
    email: user.email,
    role: "authenticated",
  });

  return {
    access_token: accessToken,
    refresh_token: "refresh-test",
    expires_in: expiresIn,
    expires_at: expiresAt,
    token_type: "bearer",
    user: {
      id: user.id,
      email: user.email,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    },
  } as unknown as Session;
}

export function getSupabaseStorageKey(params?: {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}): string {
  const supabaseUrl =
    params?.supabaseUrl ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "http://localhost:54321";
  const supabaseAnonKey =
    params?.supabaseAnonKey ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "test-anon-key";

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true },
  });
  return client.auth.storageKey;
}

export async function installSupabaseSession(
  page: Page,
  session: Session,
  params?: { supabaseUrl?: string; supabaseAnonKey?: string }
): Promise<void> {
  const storageKey = getSupabaseStorageKey(params);

  // Must run before the first navigation so `getSession()` reads from localStorage.
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: storageKey, value: JSON.stringify(session) }
  );
}
