import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type AuthenticatedSupabase = {
  supabase: SupabaseClient;
  user: User;
};

export function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function getAuthenticatedSupabase(
  request: Request,
): Promise<AuthenticatedSupabase | NextResponse> {
  const token = getBearerToken(request);
  if (!token) {
    return jsonNoStore({ error: "missing_bearer_token" }, 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonNoStore({ error: "supabase_not_configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return jsonNoStore({ error: "invalid_bearer_token" }, 401);
  }

  return { supabase, user: data.user };
}
