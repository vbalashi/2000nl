import crypto from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  getBearerToken,
  jsonNoStore,
} from "@/lib/platform/serverSupabase";

export const CONNECT_SCOPES = {
  "platform:read": "Read your 2000NL dictionary and learning state",
  "platform:write": "Update your 2000NL learning progress",
  offline_access: "Stay connected after closing the browser",
} as const;

export type ConnectedClientScope = keyof typeof CONNECT_SCOPES;

const CONNECT_SCOPE_SET = new Set(Object.keys(CONNECT_SCOPES));

export type ConnectedClientRow = {
  client_id: string;
  display_name: string;
  client_type: string;
  status: string;
  allowed_redirect_uris: string[];
  allowed_origins: string[];
  allowed_scopes: string[];
  requires_pkce: boolean;
  client_secret_hash: string | null;
};

export type ConnectedClientGrantRow = {
  client_id: string;
  user_id: string;
  scopes: string[];
  revoked_at: string | null;
};

export type ConnectAuthorizationCodeRow = {
  code_hash: string;
  client_id: string;
  user_id: string;
  user_email: string;
  redirect_uri: string;
  scopes: string[];
  code_challenge: string;
  code_challenge_method: string;
  expires_at: string;
  used_at: string | null;
};

type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
  expires_in?: number | null;
  token_type: string;
  user: User;
};

export function connectCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin) return {};

  const allowedOrigins = (
    process.env.CONNECT_API_ALLOWED_ORIGINS ??
    process.env.PLATFORM_API_ALLOWED_ORIGINS ??
    ""
  )
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

export function withConnectCors<T extends Response>(request: Request, response: T): T {
  Object.entries(connectCorsHeaders(request)).forEach(([key, value]) => {
    response.headers.set(key, String(value));
  });
  return response;
}

export function connectCorsPreflight(request: Request): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      ...connectCorsHeaders(request),
    },
  });
}

export function createServiceClient(): SupabaseClient | NextResponse {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return jsonNoStore({ error: "connect_service_not_configured" }, 500);
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function createPublicAuthClient(): SupabaseClient | NextResponse {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return jsonNoStore({ error: "connect_public_auth_not_configured" }, 500);
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export async function getWebUser(request: Request): Promise<User | NextResponse> {
  const token = getBearerToken(request);
  if (!token) {
    return jsonNoStore({ error: "missing_bearer_token" }, 401);
  }

  const publicClient = createPublicAuthClient();
  if (publicClient instanceof NextResponse) return publicClient;

  const { data, error } = await publicClient.auth.getUser(token);
  if (error || !data.user) {
    return jsonNoStore({ error: "invalid_bearer_token" }, 401);
  }

  return data.user;
}

export function normalizeRedirectUri(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value.trim()).href;
  } catch {
    return null;
  }
}

export function parseScopes(value: unknown): string[] {
  const raw =
    typeof value === "string"
      ? value.split(/\s+/)
      : Array.isArray(value)
        ? value
        : [];

  return Array.from(
    new Set(
      raw
        .map((scope) => (typeof scope === "string" ? scope.trim() : ""))
        .filter(Boolean),
    ),
  );
}

export function validateScopes(
  requestedScopes: string[],
  allowedScopes: string[],
): { ok: true; scopes: ConnectedClientScope[] } | { ok: false; error: string } {
  if (requestedScopes.length === 0) {
    return { ok: false, error: "missing_scope" };
  }

  for (const scope of requestedScopes) {
    if (!CONNECT_SCOPE_SET.has(scope)) {
      return { ok: false, error: "unsupported_scope" };
    }
    if (!allowedScopes.includes(scope)) {
      return { ok: false, error: "scope_not_allowed" };
    }
  }

  return { ok: true, scopes: requestedScopes as ConnectedClientScope[] };
}

export async function loadConnectedClient(
  supabase: SupabaseClient,
  clientId: string,
): Promise<ConnectedClientRow | NextResponse> {
  const { data, error } = await supabase
    .from("connected_clients")
    .select(
      "client_id, display_name, client_type, status, allowed_redirect_uris, allowed_origins, allowed_scopes, requires_pkce, client_secret_hash",
    )
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    return jsonNoStore({ error: "client_lookup_failed", detail: error.message }, 500);
  }
  if (!data || data.status !== "active") {
    return jsonNoStore({ error: "invalid_client" }, 400);
  }

  return data as ConnectedClientRow;
}

export function validateRedirectUri(
  client: ConnectedClientRow,
  redirectUri: string | null,
): redirectUri is string {
  return Boolean(redirectUri && client.allowed_redirect_uris.includes(redirectUri));
}

export function randomOpaqueToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("base64url");
}

export function sha256Base64Url(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function verifyPkce(params: {
  challenge: string;
  method: string;
  verifier: string | null;
}): boolean {
  if (!params.verifier) return false;
  if (params.method !== "S256") return false;
  return sha256Base64Url(params.verifier) === params.challenge;
}

export async function upsertGrant(params: {
  supabase: SupabaseClient;
  clientId: string;
  userId: string;
  scopes: string[];
}): Promise<NextResponse | null> {
  const { error } = await params.supabase
    .from("connected_client_grants")
    .upsert(
      {
        client_id: params.clientId,
        user_id: params.userId,
        scopes: params.scopes,
        revoked_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,user_id" },
    );

  if (error) {
    return jsonNoStore({ error: "grant_save_failed", detail: error.message }, 500);
  }

  return null;
}

export async function loadActiveGrant(params: {
  supabase: SupabaseClient;
  clientId: string;
  userId: string;
}): Promise<ConnectedClientGrantRow | null | NextResponse> {
  const { data, error } = await params.supabase
    .from("connected_client_grants")
    .select("client_id, user_id, scopes, revoked_at")
    .eq("client_id", params.clientId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error) {
    return jsonNoStore({ error: "grant_lookup_failed", detail: error.message }, 500);
  }
  if (!data || data.revoked_at) return null;
  return data as ConnectedClientGrantRow;
}

export function grantContainsScopes(grant: ConnectedClientGrantRow, scopes: string[]) {
  return scopes.every((scope) => grant.scopes.includes(scope));
}

export async function issueSupabaseSessionForUser(params: {
  adminClient: SupabaseClient;
  publicClient: SupabaseClient;
  email: string;
}): Promise<SupabaseSession | NextResponse> {
  const linkRes = await params.adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: params.email,
  });

  const emailOtp = linkRes.data?.properties?.email_otp;
  if (linkRes.error || !emailOtp) {
    return jsonNoStore(
      {
        error: "session_link_failed",
        detail: linkRes.error?.message ?? "Failed to generate auth link.",
      },
      500,
    );
  }

  const verifyRes = await params.publicClient.auth.verifyOtp({
    email: params.email,
    token: emailOtp,
    type: "email",
  });

  if (verifyRes.error || !verifyRes.data?.session) {
    return jsonNoStore(
      {
        error: "session_exchange_failed",
        detail: verifyRes.error?.message ?? "Failed to create session.",
      },
      500,
    );
  }

  return verifyRes.data.session as SupabaseSession;
}

export async function refreshSupabaseSession(params: {
  publicClient: SupabaseClient;
  refreshToken: string;
}): Promise<SupabaseSession | NextResponse> {
  const refreshRes = await params.publicClient.auth.refreshSession({
    refresh_token: params.refreshToken,
  });

  if (refreshRes.error || !refreshRes.data?.session) {
    return jsonNoStore({ error: "invalid_refresh_token" }, 401);
  }

  return refreshRes.data.session as SupabaseSession;
}

export async function recordConnectedClientSession(params: {
  supabase: SupabaseClient;
  refreshToken: string;
  clientId: string;
  userId: string;
  scopes: string[];
}): Promise<NextResponse | null> {
  const { error } = await params.supabase.from("connected_client_sessions").insert({
    refresh_token_hash: sha256Hex(params.refreshToken),
    client_id: params.clientId,
    user_id: params.userId,
    scopes: params.scopes,
  });

  if (error) {
    return jsonNoStore({ error: "session_record_failed", detail: error.message }, 500);
  }

  return null;
}

export function publicSessionPayload(session: SupabaseSession, scopes: string[]) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? null,
    expires_in: session.expires_in ?? null,
    token_type: session.token_type ?? "bearer",
    scope: scopes.join(" "),
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
    },
  };
}
