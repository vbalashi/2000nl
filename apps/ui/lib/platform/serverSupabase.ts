import { CONNECT_BACKEND_HEADER, CONNECT_SESSION_COLUMNS, decryptProviderSession, isConnectAccessToken, tokenHash, verifiedSessionId, type ConnectedSessionRow } from "@/lib/connect/sessionCredentials";
import { diagnosticSupabaseFetch, identifyDiagnosticActor } from "../diagnostics/server";
import { checkAdmissionLazy } from "@/lib/admission/server";
import { serverSupabaseConfig } from "@/lib/runtime/publicConfig";
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
const inflightPlatformAuth = new Map<
  string,
  Promise<{ user: User; principal: PlatformPrincipal } | null>
>();
const PLATFORM_AUTH_CACHE_MAX_ENTRIES = 256;
const FIRST_PARTY_AUTH_CACHE_DEFAULT_TTL_MS = 60_000;
const FIRST_PARTY_AUTH_CACHE_MAX_TTL_MS = 300_000;
const TOKEN_EXPIRY_SKEW_MS = 5_000;

function platformAuthCacheTtlMs() {
  const parsed = Number(process.env.PLATFORM_AUTH_CACHE_TTL_MS);
  if (Number.isFinite(parsed)) return Math.max(0, Math.min(parsed, 60_000));
  return 5_000;
}

// Connected-client grants are revocable, so they keep the short TTL above.
// First-party bearer tokens stay valid until `exp` regardless of this cache.
function firstPartyAuthCacheTtlMs(token: string) {
  const parsed = Number(process.env.PLATFORM_FIRST_PARTY_AUTH_CACHE_TTL_MS);
  const configured = Number.isFinite(parsed)
    ? Math.max(0, Math.min(parsed, FIRST_PARTY_AUTH_CACHE_MAX_TTL_MS))
    : FIRST_PARTY_AUTH_CACHE_DEFAULT_TTL_MS;
  const expiresAtMs = bearerTokenExpiresAtMs(token);
  if (expiresAtMs === null) return Math.min(configured, platformAuthCacheTtlMs());
  return Math.max(
    0,
    Math.min(configured, expiresAtMs - TOKEN_EXPIRY_SKEW_MS - Date.now()),
  );
}

function bearerTokenExpiresAtMs(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims?.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

function platformAuthCacheEnabled() {
  return (
    (process.env.NODE_ENV !== "test" ||
      process.env.PLATFORM_AUTH_CACHE_IN_TESTS === "1") &&
    platformAuthCacheTtlMs() > 0
  );
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
  const ttlMs =
    principal.authKind === "first_party"
      ? firstPartyAuthCacheTtlMs(token)
      : platformAuthCacheTtlMs();
  if (ttlMs <= 0) return;
  const tokenHash = sha256Hex(token);
  if (platformAuthCache.size >= PLATFORM_AUTH_CACHE_MAX_ENTRIES) {
    const firstKey = platformAuthCache.keys().next().value;
    if (firstKey) platformAuthCache.delete(firstKey);
  }
  platformAuthCache.set(tokenHash, {
    user,
    principal,
    expiresAtMs: Date.now() + ttlMs,
  });
}

export function resetPlatformAuthCacheForTests() {
  platformAuthCache.clear();
  inflightPlatformAuth.clear();
}

function createServiceSupabaseClient(
  supabaseUrl: string,
  serviceKey: string,
): SupabaseClient {
  return createClient(supabaseUrl, serviceKey, {
    global: { fetch: diagnosticSupabaseFetch },
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
    "Access-Control-Allow-Headers":
      "authorization, content-type, x-platform-action-attempt",
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

function createAuthenticatedBearerClient(token: string, backendProof?: string): SupabaseClient | NextResponse {
  const supabaseUrl = serverSupabaseConfig().url;
  const supabaseAnonKey = serverSupabaseConfig().anonKey;
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
      fetch: diagnosticSupabaseFetch,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(backendProof ? { [CONNECT_BACKEND_HEADER]: backendProof } : {}),
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

  if (isConnectAccessToken(token)) return jsonNoStore({ error: "first_party_required" }, 403);
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

  const denied = await checkAdmissionLazy(platformServiceClient, data.user.id); if (denied) return denied;
  const sessionDenied = await requireFirstPartySession(supabase);
  if (sessionDenied) return sessionDenied;
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

  if (isConnectAccessToken(token)) return resolveConnectedSupabase(token, instrumentation);

  const cached = readPlatformAuthCache(token);
  if (cached) {
    const denied = await checkAdmissionLazy(platformServiceClient, cached.user.id); if (denied) return denied;
    const cacheStartedAt = performance.now();
    const supabase = createAuthenticatedBearerClient(token);
    if (supabase instanceof NextResponse) return supabase;
    const sessionDenied = await requireFirstPartySession(supabase);
    if (sessionDenied) return sessionDenied;
    recordAuthTiming(instrumentation, "auth.cache-hit", performance.now() - cacheStartedAt);
    identifyDiagnosticActor(cached.user.id);
    return {
      supabase,
      user: cached.user,
      principal: cached.principal,
    };
  }

  const tokenHash = sha256Hex(token);
  const pending = platformAuthCacheEnabled()
    ? inflightPlatformAuth.get(tokenHash)
    : undefined;
  if (pending) {
    const waitStartedAt = performance.now();
    const shared = await pending;
    recordAuthTiming(instrumentation, "auth.coalesced", performance.now() - waitStartedAt);
    if (shared) {
      const denied = await checkAdmissionLazy(platformServiceClient, shared.user.id); if (denied) return denied;
      const supabase = createAuthenticatedBearerClient(token);
      if (supabase instanceof NextResponse) return supabase;
      const sessionDenied = await requireFirstPartySession(supabase);
      if (sessionDenied) return sessionDenied;
      identifyDiagnosticActor(shared.user.id);
      return { supabase, ...shared };
    }
  }

  const resolution = resolveAuthenticatedSupabase(request, token, instrumentation);
  if (platformAuthCacheEnabled() && !pending) {
    const shared = resolution.then(
      (auth) =>
        auth instanceof NextResponse
          ? null
          : { user: auth.user, principal: auth.principal },
      () => null,
    );
    inflightPlatformAuth.set(tokenHash, shared);
    void shared.then(() => {
      if (inflightPlatformAuth.get(tokenHash) === shared) {
        inflightPlatformAuth.delete(tokenHash);
      }
    });
  }
  return resolution;
}

async function resolveAuthenticatedSupabase(
  request: Request,
  token: string,
  instrumentation?: TimingEntrySink,
): Promise<AuthenticatedSupabase | NextResponse> {
  const auth = await getAuthenticatedUserSupabase(request, instrumentation);
  if (auth instanceof NextResponse) return auth;

  const principal: PlatformPrincipal = {
    userId: auth.user.id, authKind: "first_party", connectedClientId: null,
    connectedSessionId: null, scopes: new Set(["platform:read", "platform:write"]),
  };

  writePlatformAuthCache(token, auth.user, principal);

  identifyDiagnosticActor(auth.user.id);
  return { ...auth, principal };
}

function platformServiceClient(): SupabaseClient | null {
  const supabaseUrl = serverSupabaseConfig().url;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return getServiceSupabaseClient(supabaseUrl, serviceKey);
}

async function requireFirstPartySession(supabase: SupabaseClient): Promise<NextResponse | null> {
  try {
    const { data, error } = await supabase.rpc("check_first_party_session_v1");
    if (error || data !== true) return jsonNoStore({ error: "session_reauthentication_required" }, 401);
    return null;
  } catch { return jsonNoStore({ error: "session_authorization_unavailable" }, 503); }
}

async function resolveConnectedSupabase(token: string, instrumentation?: TimingEntrySink): Promise<AuthenticatedSupabase | NextResponse> {
  const service = platformServiceClient();
  if (!service) return jsonNoStore({ error: "connect_service_not_configured" }, 503);
  const { data, error } = await service.from("connected_client_sessions")
    .select(CONNECT_SESSION_COLUMNS).eq("access_token_hash", tokenHash(token)).maybeSingle();
  if (error) return jsonNoStore({ error: "platform_principal_lookup_failed" }, 503);
  const row = data as ConnectedSessionRow | null;
  if (!row || row.credential_version !== 2 || !row.auth_session_id || !row.provider_session_ciphertext)
    return jsonNoStore({ error: "invalid_bearer_token" }, 401);
  if (row.revoked_at) return jsonNoStore({ error: "connected_client_session_revoked" }, 401);
  if (!row.access_token_expires_at || Date.parse(row.access_token_expires_at) <= Date.now()
    || !row.refresh_token_expires_at || Date.parse(row.refresh_token_expires_at) <= Date.now())
    return jsonNoStore({ error: "connected_client_token_expired" }, 401);
  const [client, grant] = await Promise.all([
    service.from("connected_clients").select("status,allowed_scopes").eq("client_id", row.client_id).maybeSingle(),
    service.from("connected_client_grants").select("scopes,revoked_at,authority_revision").eq("client_id", row.client_id).eq("user_id", row.user_id).maybeSingle(),
  ]);
  if (client.error || grant.error) return jsonNoStore({ error: "platform_principal_lookup_failed" }, 503);
  if (client.data?.status !== "active") return jsonNoStore({ error: "connected_client_disabled" }, 401);
  const grantedScopes: string[] = grant.data?.scopes ?? [], allowedScopes: string[] = client.data?.allowed_scopes ?? [];
  if (!grant.data || grant.data.revoked_at || grant.data.authority_revision !== row.grant_revision || !row.scopes.every(scope => grantedScopes.includes(scope) && allowedScopes.includes(scope)))
    return jsonNoStore({ error: "connected_client_grant_revoked" }, 401);
  let envelope;
  try { envelope = decryptProviderSession(row.provider_session_ciphertext, row.id); }
  catch { return jsonNoStore({ error: "connect_credentials_unavailable" }, 503); }
  if (envelope.session.user.id !== row.user_id || verifiedSessionId(envelope.session.access_token) !== row.auth_session_id)
    return jsonNoStore({ error: "connected_client_token_user_mismatch" }, 401);
  const supabase = createAuthenticatedBearerClient(envelope.session.access_token, envelope.proof);
  if (supabase instanceof NextResponse) return supabase;
  const verified = await measureAuthTiming(instrumentation, "auth.get-user", () => supabase.auth.getUser(envelope.session.access_token));
  if (verified.error || verified.data.user?.id !== row.user_id) return jsonNoStore({ error: "invalid_bearer_token" }, 401);
  const denied = await checkAdmissionLazy(platformServiceClient, row.user_id); if (denied) return denied;
  identifyDiagnosticActor(row.user_id);
  return { supabase, user: verified.data.user, principal: {
    userId: row.user_id, authKind: "connected_client", connectedClientId: row.client_id,
    connectedSessionId: row.id, scopes: new Set(row.scopes.filter((scope): scope is ConnectedClientScope =>
      scope === "platform:read" || scope === "platform:write" || scope === "offline_access")),
  } };
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

  const supabaseUrl = serverSupabaseConfig().url;
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
  const supabaseUrl = serverSupabaseConfig().url;
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

export function getTranslationServiceSupabase(): ServiceSupabase | NextResponse {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return jsonNoStore({ error: "supabase_service_not_configured" }, 500);
  }
  return { supabase: getServiceSupabaseClient(supabaseUrl, serviceKey) };
}
