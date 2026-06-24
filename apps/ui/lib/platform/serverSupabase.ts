import crypto from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type ConnectedClientScope = "platform:read" | "platform:write" | "offline_access";

export type PlatformPrincipal = {
  userId: string;
  authKind: "first_party" | "connected_client";
  connectedClientId: string | null;
  connectedSessionId: string | null;
  scopes: ReadonlySet<ConnectedClientScope>;
};

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export type AuthenticatedSupabase = {
  supabase: SupabaseClient;
  user: User;
  principal: PlatformPrincipal;
};

export type AuthenticatedUserSupabase = {
  supabase: SupabaseClient;
  user: User;
};

export type ServiceSupabase = {
  supabase: SupabaseClient;
};

type TimingEntrySink = {
  entries: Array<{ name: string; durationMs: number }>;
};

type ServiceClientCache = {
  url: string;
  key: string;
  client: SupabaseClient;
};

type PlatformAuthCacheEntry = {
  user: User;
  principal: PlatformPrincipal;
  expiresAtMs: number;
};

let serviceClientCache: ServiceClientCache | null = null;
const platformAuthCache = new Map<string, PlatformAuthCacheEntry>();
const PLATFORM_AUTH_CACHE_MAX_ENTRIES = 256;

function platformAuthCacheTtlMs() {
  const parsed = Number(process.env.PLATFORM_AUTH_CACHE_TTL_MS);
  if (Number.isFinite(parsed)) return Math.max(0, Math.min(parsed, 60_000));
  return 5_000;
}

function platformAuthCacheEnabled() {
  return process.env.NODE_ENV !== "test" && platformAuthCacheTtlMs() > 0;
}

function readPlatformAuthCache(token: string): PlatformAuthCacheEntry | null {
  if (!platformAuthCacheEnabled()) return null;
  const tokenHash = sha256Hex(token);
  const entry = platformAuthCache.get(tokenHash);
  if (!entry) return null;
  if (entry.expiresAtMs <= Date.now()) {
    platformAuthCache.delete(tokenHash);
    return null;
  }
  return entry;
}

function writePlatformAuthCache(
  token: string,
  user: User,
  principal: PlatformPrincipal,
) {
  if (!platformAuthCacheEnabled()) return;
  const tokenHash = sha256Hex(token);
  if (platformAuthCache.size >= PLATFORM_AUTH_CACHE_MAX_ENTRIES) {
    const firstKey = platformAuthCache.keys().next().value;
    if (firstKey) platformAuthCache.delete(firstKey);
  }
  platformAuthCache.set(tokenHash, {
    user,
    principal,
    expiresAtMs: Date.now() + platformAuthCacheTtlMs(),
  });
}

function createServiceSupabaseClient(
  supabaseUrl: string,
  serviceKey: string,
): SupabaseClient {
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function getServiceSupabaseClient(
  supabaseUrl: string,
  serviceKey: string,
): SupabaseClient {
  if (process.env.NODE_ENV === "test") {
    return createServiceSupabaseClient(supabaseUrl, serviceKey);
  }

  if (
    serviceClientCache &&
    serviceClientCache.url === supabaseUrl &&
    serviceClientCache.key === serviceKey
  ) {
    return serviceClientCache.client;
  }

  const client = createServiceSupabaseClient(supabaseUrl, serviceKey);
  serviceClientCache = { url: supabaseUrl, key: serviceKey, client };
  return client;
}

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

function recordAuthTiming(
  instrumentation: TimingEntrySink | undefined,
  name: string,
  durationMs: number,
) {
  instrumentation?.entries.push({
    name,
    durationMs,
  });
}

async function measureAuthTiming<T>(
  instrumentation: TimingEntrySink | undefined,
  name: string,
  fn: () => PromiseLike<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await Promise.resolve(fn());
  } finally {
    instrumentation?.entries.push({
      name,
      durationMs: performance.now() - startedAt,
    });
  }
}

function createAuthenticatedBearerClient(token: string): SupabaseClient | NextResponse {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonNoStore({ error: "supabase_not_configured" }, 500);
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
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
}

async function getAuthenticatedUserSupabase(
  request: Request,
  instrumentation?: TimingEntrySink,
): Promise<AuthenticatedUserSupabase | NextResponse> {
  const token = getBearerToken(request);
  if (!token) {
    return jsonNoStore({ error: "missing_bearer_token" }, 401);
  }

  const supabase = createAuthenticatedBearerClient(token);
  if (supabase instanceof NextResponse) return supabase;

  const { data, error } = await measureAuthTiming(
    instrumentation,
    "auth.get-user",
    () => supabase.auth.getUser(token),
  );
  if (error || !data.user) {
    return jsonNoStore({ error: "invalid_bearer_token" }, 401);
  }

  return { supabase, user: data.user };
}

export { getAuthenticatedUserSupabase };

export async function getAuthenticatedSupabase(
  request: Request,
  instrumentation?: TimingEntrySink,
): Promise<AuthenticatedSupabase | NextResponse> {
  const token = getBearerToken(request);
  if (!token) {
    return jsonNoStore({ error: "missing_bearer_token" }, 401);
  }

  const cached = readPlatformAuthCache(token);
  if (cached) {
    const cacheStartedAt = performance.now();
    const supabase = createAuthenticatedBearerClient(token);
    if (supabase instanceof NextResponse) return supabase;
    recordAuthTiming(instrumentation, "auth.cache-hit", performance.now() - cacheStartedAt);
    return {
      supabase,
      user: cached.user,
      principal: cached.principal,
    };
  }

  const auth = await getAuthenticatedUserSupabase(request, instrumentation);
  if (auth instanceof NextResponse) return auth;

  const principal = await resolvePlatformPrincipal(
    {
      token,
      userId: auth.user.id,
    },
    instrumentation,
  );
  if (principal instanceof NextResponse) return principal;

  writePlatformAuthCache(token, auth.user, principal);

  return { ...auth, principal };
}

function platformServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return getServiceSupabaseClient(supabaseUrl, serviceKey);
}

async function resolvePlatformPrincipal(
  params: {
    token: string;
    userId: string;
  },
  instrumentation?: TimingEntrySink,
): Promise<PlatformPrincipal | NextResponse> {
  const firstParty: PlatformPrincipal = {
    userId: params.userId,
    authKind: "first_party",
    connectedClientId: null,
    connectedSessionId: null,
    scopes: new Set(["platform:read", "platform:write"]),
  };

  if (
    process.env.NODE_ENV === "test" &&
    process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP !== "1"
  ) {
    return firstParty;
  }

  const service = platformServiceClient();
  if (!service) return firstParty;
  if (typeof service.from !== "function") return firstParty;

  let sessionQuery: any;
  try {
    sessionQuery = service.from("connected_client_sessions");
  } catch (error) {
    if (process.env.NODE_ENV === "test") return firstParty;
    throw error;
  }
  if (!sessionQuery || typeof sessionQuery.select !== "function") {
    return firstParty;
  }

  const { data: session, error: sessionError } = await measureAuthTiming<{
    data: unknown;
    error: { message?: string } | null;
  }>(
    instrumentation,
    "auth.principal-session",
    () =>
      sessionQuery
        .select("id, client_id, user_id, scopes, revoked_at, access_token_expires_at")
        .eq("access_token_hash", sha256Hex(params.token))
        .maybeSingle(),
  );

  if (sessionError) {
    return jsonNoStore(
      { error: "platform_principal_lookup_failed", detail: sessionError.message },
      500,
    );
  }
  if (!session) return firstParty;

  const row = session as {
    id: string;
    client_id: string;
    user_id: string;
    scopes: ConnectedClientScope[];
    revoked_at: string | null;
    access_token_expires_at: string | null;
  };

  if (row.user_id !== params.userId) {
    return jsonNoStore({ error: "connected_client_token_user_mismatch" }, 401);
  }
  if (row.revoked_at) {
    return jsonNoStore({ error: "connected_client_session_revoked" }, 401);
  }
  if (
    row.access_token_expires_at &&
    Date.parse(row.access_token_expires_at) <= Date.now()
  ) {
    return jsonNoStore({ error: "connected_client_token_expired" }, 401);
  }

  const [clientResult, grantResult] = await Promise.all([
    measureAuthTiming(instrumentation, "auth.principal-client", () =>
      service
        .from("connected_clients")
        .select("client_id, status")
        .eq("client_id", row.client_id)
        .maybeSingle(),
    ),
    measureAuthTiming(instrumentation, "auth.principal-grant", () =>
      service
        .from("connected_client_grants")
        .select("scopes, revoked_at")
        .eq("client_id", row.client_id)
        .eq("user_id", row.user_id)
        .maybeSingle(),
    ),
  ]);

  const { data: client, error: clientError } = clientResult;
  if (clientError) {
    return jsonNoStore(
      { error: "connected_client_lookup_failed", detail: clientError.message },
      500,
    );
  }
  if (!client || (client as { status?: string }).status !== "active") {
    return jsonNoStore({ error: "connected_client_disabled" }, 401);
  }

  const { data: grant, error: grantError } = grantResult;
  if (grantError) {
    return jsonNoStore(
      { error: "connected_client_grant_lookup_failed", detail: grantError.message },
      500,
    );
  }
  if (!grant || (grant as { revoked_at?: string | null }).revoked_at) {
    return jsonNoStore({ error: "connected_client_grant_revoked" }, 401);
  }

  const grantedScopes = ((grant as { scopes?: ConnectedClientScope[] }).scopes ?? [])
    .filter((scope): scope is ConnectedClientScope =>
      scope === "platform:read" ||
      scope === "platform:write" ||
      scope === "offline_access",
    );
  const sessionScopes = row.scopes.filter((scope) => grantedScopes.includes(scope));

  return {
    userId: row.user_id,
    authKind: "connected_client",
    connectedClientId: row.client_id,
    connectedSessionId: row.id,
    scopes: new Set(sessionScopes),
  };
}

export function requirePlatformScope(
  auth: AuthenticatedSupabase,
  scope: "platform:read" | "platform:write",
): NextResponse | null {
  if (auth.principal.authKind === "first_party") return null;
  if (auth.principal.scopes.has(scope)) return null;
  return jsonNoStore(
    {
      error: "insufficient_scope",
      requiredScope: scope,
    },
    403,
  );
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

  return { supabase: getServiceSupabaseClient(supabaseUrl, serviceKey) };
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
    supabase: getServiceSupabaseClient(supabaseUrl, serviceKey),
  };
}
