import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export type AuthenticatedSupabase = {
  supabase: SupabaseClient;
  user: User;
};

export type ServiceSupabase = {
  supabase: SupabaseClient;
};

export function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function platformCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin) return {};

  const allowedOrigins = (process.env.PLATFORM_API_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const allowAll = allowedOrigins.includes("*");
  if (!allowAll && !allowedOrigins.includes(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": allowAll ? "*" : origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function withPlatformCors<T extends Response>(
  request: Request,
  response: T,
): T {
  const headers = platformCorsHeaders(request);
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, String(value));
  });
  return response;
}

export function platformCorsPreflight(request: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      ...platformCorsHeaders(request),
    },
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

export async function getCatalogSupabase(
  request: Request,
): Promise<ServiceSupabase | NextResponse> {
  const expectedToken = process.env.PLATFORM_CATALOG_ACCESS_TOKEN;
  if (!expectedToken) {
    return jsonNoStore({ error: "catalog_lookup_not_configured" }, 500);
  }

  const token = getBearerToken(request);
  if (!token || token !== expectedToken) {
    return jsonNoStore({ error: "invalid_catalog_token" }, 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return jsonNoStore({ error: "supabase_service_not_configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return { supabase };
}

export function getPlatformServiceSupabase(): ServiceSupabase | NextResponse {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return jsonNoStore({ error: "supabase_service_not_configured" }, 500);
  }

  return {
    supabase: createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    }),
  };
}
