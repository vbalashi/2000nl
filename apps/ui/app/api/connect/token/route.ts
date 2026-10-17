import crypto from "node:crypto";
import { CONNECT_ACCESS_PREFIX, CONNECT_REFRESH_PREFIX, CONNECT_REFRESH_LIFETIME_MS, credentialKey, decryptNativeSession, encryptNativeSession } from "@/lib/connect/sessionCredentials";
import { NextRequest } from "next/server";
import {
  connectCorsPreflight,
  createPublicAuthClient,
  createServiceClient,
  grantContainsScopes,
  issueSupabaseSessionForUser,
  loadActiveGrant,
  loadConnectedClient,
  normalizeRedirectUri,
  publicSessionPayload,
  randomOpaqueToken,
  refreshSupabaseSession,
  sha256Hex,
  verifyPkce,
  withConnectCors,
  type ConnectAuthorizationCodeRow,
} from "@/lib/connect/connectServer";
import { jsonNoStore } from "@/lib/platform/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TokenBody = Record<string, unknown>;

async function readBody(request: NextRequest): Promise<TokenBody> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }

  try {
    return (await request.json()) as TokenBody;
  } catch {
    return {};
  }
}

function stringField(body: TokenBody, field: string): string | null {
  const value = body[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function OPTIONS(request: NextRequest) {
  return connectCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  const reply = (payload: unknown, status = 200) =>
    withConnectCors(request, jsonNoStore(payload, status));

  const body = await readBody(request);
  const grantType = stringField(body, "grant_type");
  const clientId = stringField(body, "client_id");

  if (!grantType) return reply({ error: "missing_grant_type" }, 400);
  if (!clientId) return reply({ error: "missing_client_id" }, 400);

  const service = createServiceClient();
  if (service instanceof Response) return withConnectCors(request, service);

  try { credentialKey(); } catch { return reply({ error: "connect_session_key_not_configured" }, 503); }

  const publicClient = createPublicAuthClient();
  if (publicClient instanceof Response) return withConnectCors(request, publicClient);

  const client = await loadConnectedClient(service, clientId);
  if (client instanceof Response) return withConnectCors(request, client);

  if (client.client_type === "server_web_app") {
    const clientSecret = stringField(body, "client_secret");
    if (!clientSecret || sha256Hex(clientSecret) !== client.client_secret_hash) {
      return reply({ error: "invalid_client" }, 401);
    }
  }

  if (grantType === "authorization_code") {
    const code = stringField(body, "code");
    const redirectUri = normalizeRedirectUri(body.redirect_uri);
    const codeVerifier = stringField(body, "code_verifier");

    if (!code) return reply({ error: "missing_code" }, 400);
    if (!redirectUri) return reply({ error: "missing_redirect_uri" }, 400);

    const { data, error } = await service
      .from("connect_authorization_codes")
      .select(
        "code_hash, client_id, user_id, user_email, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at, used_at",
      )
      .eq("code_hash", sha256Hex(code))
      .maybeSingle();

    if (error) {
      return reply({ error: "authorization_code_lookup_failed", detail: error.message }, 500);
    }

    const authCode = data as ConnectAuthorizationCodeRow | null;
    if (!authCode || authCode.client_id !== clientId) {
      return reply({ error: "invalid_code" }, 400);
    }
    if (authCode.used_at) {
      return reply({ error: "code_already_used" }, 400);
    }
    if (Date.parse(authCode.expires_at) <= Date.now()) {
      return reply({ error: "code_expired" }, 400);
    }
    if (authCode.redirect_uri !== redirectUri) {
      return reply({ error: "redirect_uri_mismatch" }, 400);
    }
    if (
      !verifyPkce({
        challenge: authCode.code_challenge,
        method: authCode.code_challenge_method,
        verifier: codeVerifier,
      })
    ) {
      return reply({ error: "invalid_code_verifier" }, 400);
    }

    const grant = await loadActiveGrant({
      supabase: service,
      clientId,
      userId: authCode.user_id,
    });
    if (grant instanceof Response) return withConnectCors(request, grant);
    if (!grant || !grantContainsScopes(grant, authCode.scopes)) {
      return reply({ error: "grant_revoked" }, 401);
    }

    // Consume before any external Auth side effect. Failure burns the code.
    const { data: claimed, error: claimError } = await service
      .from("connect_authorization_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("code_hash", authCode.code_hash)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("code_hash")
      .maybeSingle();
    if (claimError) return reply({ error: "authorization_code_claim_failed" }, 500);
    if (!claimed) return reply({ error: "code_already_used" }, 400);

    const session = await issueSupabaseSessionForUser({
      adminClient: service,
      publicClient,
      email: authCode.user_email,
    });
    if (session instanceof Response) return withConnectCors(request, session);

    if (session.user.id !== authCode.user_id) return reply({ error: "session_user_mismatch" }, 401);
    const id = crypto.randomUUID();
    const accessToken = CONNECT_ACCESS_PREFIX + randomOpaqueToken();
    const refreshToken = CONNECT_REFRESH_PREFIX + randomOpaqueToken();
    const refreshExpiresAt = new Date(Date.now() + CONNECT_REFRESH_LIFETIME_MS).toISOString();
    if (!session.expires_at) return reply({ error: "session_expiry_missing" }, 500);
    const { error: recordError } = await service.from("connected_client_sessions").insert({
      id,
      credential_version: 2,
      native_session_ciphertext: encryptNativeSession(session, id, authCode.user_id, clientId),
      access_token_hash: sha256Hex(accessToken),
      access_token_expires_at: new Date(session.expires_at * 1000).toISOString(),
      refresh_token_hash: sha256Hex(refreshToken),
      refresh_token_expires_at: authCode.scopes.includes("offline_access") ? refreshExpiresAt : null,
      client_id: clientId,
      user_id: authCode.user_id,
      scopes: authCode.scopes,
    });
    if (recordError) return reply({ error: "session_record_failed" }, 500);

    await service
      .from("connected_client_grants")
      .update({ last_used_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .eq("user_id", authCode.user_id);

    return reply(publicSessionPayload({ ...session, access_token: accessToken, refresh_token: refreshToken }, authCode.scopes));
  }

  if (grantType === "refresh_token") {
    const refreshToken = stringField(body, "refresh_token");
    if (!refreshToken) return reply({ error: "missing_refresh_token" }, 400);

    const refreshTokenHash = sha256Hex(refreshToken);
    const { data, error } = await service
      .from("connected_client_sessions")
      .select("id, credential_version, native_session_ciphertext, refresh_token_hash, refresh_token_expires_at, refresh_claim_id, client_id, user_id, scopes, revoked_at")
      .eq("refresh_token_hash", refreshTokenHash)
      .maybeSingle();

    if (error) {
      return reply({ error: "session_lookup_failed", detail: error.message }, 500);
    }

    const trackedSession = data as {
      id: string;
      credential_version: number;
      native_session_ciphertext: string;
      refresh_token_expires_at: string | null;
      refresh_claim_id: string | null;
      refresh_token_hash: string;
      client_id: string;
      user_id: string;
      scopes: string[];
      revoked_at: string | null;
    } | null;

    if (!refreshToken.startsWith(CONNECT_REFRESH_PREFIX) || !trackedSession || trackedSession.credential_version !== 2 || trackedSession.client_id !== clientId || trackedSession.revoked_at || trackedSession.refresh_claim_id || !trackedSession.scopes.includes("offline_access") || !trackedSession.refresh_token_expires_at || Date.parse(trackedSession.refresh_token_expires_at) <= Date.now()) {
      return reply({ error: "invalid_refresh_token" }, 401);
    }

    const grant = await loadActiveGrant({
      supabase: service,
      clientId,
      userId: trackedSession.user_id,
    });
    if (grant instanceof Response) return withConnectCors(request, grant);
    if (!grant || !grantContainsScopes(grant, trackedSession.scopes)) {
      return reply({ error: "grant_revoked" }, 401);
    }

    const claimId = crypto.randomUUID();
    const { data: claimed, error: claimError } = await service
      .from("connected_client_sessions")
      .update({ refresh_claim_id: claimId })
      .eq("id", trackedSession.id)
      .eq("refresh_token_hash", refreshTokenHash)
      .is("refresh_claim_id", null)
      .is("revoked_at", null)
      .gt("refresh_token_expires_at", new Date().toISOString())
      .select("id").maybeSingle();
    if (claimError || !claimed) return reply({ error: "invalid_refresh_token" }, 401);

    let nativeSession;
    try {
      nativeSession = decryptNativeSession(trackedSession.native_session_ciphertext, trackedSession.id, trackedSession.user_id, clientId);
    } catch {
      return reply({ error: "invalid_refresh_token" }, 401);
    }
    let session;
    try {
      session = await refreshSupabaseSession({ publicClient, refreshToken: nativeSession.refresh_token });
    } catch {
      return reply({ error: "invalid_refresh_token" }, 401);
    }
    if (session instanceof Response) return withConnectCors(request, session);
    if (session.user.id !== trackedSession.user_id || !session.expires_at) return reply({ error: "invalid_refresh_token" }, 401);
    const accessToken = CONNECT_ACCESS_PREFIX + randomOpaqueToken();
    const nextRefreshToken = CONNECT_REFRESH_PREFIX + randomOpaqueToken();
    const { data: rotated, error: rotateError } = await service
      .from("connected_client_sessions")
      .update({
        access_token_hash: sha256Hex(accessToken),
        access_token_expires_at: new Date(session.expires_at * 1000).toISOString(),
        refresh_token_hash: sha256Hex(nextRefreshToken),
        native_session_ciphertext: encryptNativeSession(session, trackedSession.id, trackedSession.user_id, clientId),
        refresh_claim_id: null,
        updated_at: new Date().toISOString(),
        last_refreshed_at: new Date().toISOString(),
      })
      .eq("id", trackedSession.id)
      .eq("refresh_token_hash", refreshTokenHash)
      .eq("refresh_claim_id", claimId)
      .is("revoked_at", null)
      .select("id").maybeSingle();
    if (rotateError || !rotated) return reply({ error: "invalid_refresh_token" }, 401);
    await service
      .from("connected_client_grants")
      .update({ last_used_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .eq("user_id", trackedSession.user_id);

    return reply(publicSessionPayload({ ...session, access_token: accessToken, refresh_token: nextRefreshToken }, trackedSession.scopes));
  }

  return reply({ error: "unsupported_grant_type" }, 400);
}
