import crypto from "node:crypto";
import { assertConnectEncryptionConfigured, CONNECT_ACCESS_PREFIX, CONNECT_REFRESH_PREFIX, CONNECT_REFRESH_LIFETIME_SECONDS,
  CONNECT_SESSION_COLUMNS, connectedCredentialPayload, decryptProviderSession, encryptProviderSession,
  isConnectRefreshToken, opaqueToken, verifiedSessionId, type ConnectedSessionRow } from "@/lib/connect/sessionCredentials";
import { checkAdmission } from "@/lib/admission/server";
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

  try { assertConnectEncryptionConfigured(); }
  catch { return reply({ error: "connect_credentials_unavailable" }, 503); }
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
        "grant_revision, code_hash, client_id, user_id, user_email, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at, used_at",
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

    const admissionDenied = await checkAdmission(service, authCode.user_id);
    if (admissionDenied) return withConnectCors(request, admissionDenied);
    const grant = await loadActiveGrant({
      supabase: service,
      clientId,
      userId: authCode.user_id,
    });
    if (grant instanceof Response) return withConnectCors(request, grant);
    if (!grant || !authCode.grant_revision || grant.authority_revision !== authCode.grant_revision || !grantContainsScopes(grant, authCode.scopes)) {
      return reply({ error: "grant_revoked" }, 401);
    }

    // Claim once before any provider side effect. Uncertain failures require new consent.
    const consumed = await service.from("connect_authorization_codes")
      .update({ used_at: new Date().toISOString() }).eq("code_hash", authCode.code_hash)
      .is("used_at", null).gt("expires_at", new Date().toISOString()).select("code_hash").maybeSingle();
    if (consumed.error) return reply({ error: "authorization_code_claim_failed" }, 503);
    if (!consumed.data) return reply({ error: "code_already_used" }, 400);
    const session = await issueSupabaseSessionForUser({ adminClient: service, publicClient, email: authCode.user_email });
    if (session instanceof Response) return withConnectCors(request, session);
    const authSessionId = verifiedSessionId(session.access_token);
    if (!authSessionId || session.user.id !== authCode.user_id || !session.expires_at || session.expires_at * 1000 <= Date.now())
      return reply({ error: "invalid_provider_session" }, 502);
    const id = crypto.randomUUID();
    const accessToken = opaqueToken(CONNECT_ACCESS_PREFIX), refreshToken = opaqueToken(CONNECT_REFRESH_PREFIX);
    const proof = crypto.randomBytes(32).toString("base64url");
    const { error: recordError } = await service.from("connected_client_sessions").insert({
      id, credential_version: 2, auth_session_id: authSessionId, grant_revision: authCode.grant_revision,
      access_token_hash: sha256Hex(accessToken), access_token_expires_at: new Date(session.expires_at * 1000).toISOString(),
      refresh_token_hash: sha256Hex(refreshToken), refresh_token_family_hashes: [sha256Hex(refreshToken)],
      refresh_token_expires_at: new Date(Date.now() + CONNECT_REFRESH_LIFETIME_SECONDS * 1000).toISOString(),
      provider_session_ciphertext: encryptProviderSession({ session, proof }, id), backend_proof_hash: sha256Hex(proof),
      client_id: clientId, user_id: authCode.user_id, scopes: authCode.scopes,
    });
    if (recordError) return reply({ error: "session_record_failed" }, 503);
    return reply(connectedCredentialPayload(session, authCode.scopes, accessToken, refreshToken));
  }

  if (grantType === "refresh_token") {
    const refreshToken = stringField(body, "refresh_token");
    if (!refreshToken || !isConnectRefreshToken(refreshToken)) return reply({ error: "invalid_refresh_token" }, 401);
    const refreshTokenHash = sha256Hex(refreshToken);
    const { data, error } = await service.from("connected_client_sessions").select(CONNECT_SESSION_COLUMNS)
      .eq("refresh_token_hash", refreshTokenHash).maybeSingle();
    if (error) return reply({ error: "session_lookup_failed" }, 503);
    const tracked = data as ConnectedSessionRow | null;
    if (!tracked || tracked.credential_version !== 2 || tracked.client_id !== clientId || tracked.revoked_at
      || !tracked.auth_session_id || !tracked.provider_session_ciphertext || !tracked.refresh_token_expires_at
      || Date.parse(tracked.refresh_token_expires_at) <= Date.now()) return reply({ error: "invalid_refresh_token" }, 401);
    const admissionDenied = await checkAdmission(service, tracked.user_id);
    if (admissionDenied) return withConnectCors(request, admissionDenied);
    const grant = await loadActiveGrant({ supabase: service, clientId, userId: tracked.user_id });
    if (grant instanceof Response) return withConnectCors(request, grant);
    if (!grant || grant.authority_revision !== tracked.grant_revision || !grantContainsScopes(grant, tracked.scopes)) return reply({ error: "grant_revoked" }, 401);
    let envelope;
    try { envelope = decryptProviderSession(tracked.provider_session_ciphertext, tracked.id); }
    catch { return reply({ error: "connect_credentials_unavailable" }, 503); }
    // Atomic one-time lease. A crash consumes this credential: reconnect required.
    const lease = sha256Hex(crypto.randomBytes(32).toString("base64url"));
    const claimed = await service.from("connected_client_sessions").update({ refresh_token_hash: lease })
      .eq("id", tracked.id).eq("refresh_token_hash", refreshTokenHash).is("revoked_at", null).select("id").maybeSingle();
    if (claimed.error || !claimed.data) return reply({ error: "invalid_refresh_token" }, 401);
    const failRotation = async () => {
      await service.from("connected_client_sessions").update({ revoked_at: new Date().toISOString() })
        .eq("id", tracked.id).eq("refresh_token_hash", lease);
    };
    let session;
    try { session = await refreshSupabaseSession({ publicClient, refreshToken: envelope.session.refresh_token }); }
    catch { await failRotation(); return reply({ error: "invalid_refresh_token" }, 401); }
    if (session instanceof Response) { await failRotation(); return withConnectCors(request, session); }
    if (session.user.id !== tracked.user_id || verifiedSessionId(session.access_token) !== tracked.auth_session_id
      || !session.expires_at || session.expires_at * 1000 <= Date.now()) {
      await failRotation(); return reply({ error: "invalid_provider_session" }, 502);
    }
    if (tracked.refresh_token_family_hashes.length >= 4096) { await failRotation(); return reply({ error: "reconnect_required" }, 401); }
    const accessToken = opaqueToken(CONNECT_ACCESS_PREFIX), nextRefreshToken = opaqueToken(CONNECT_REFRESH_PREFIX);
    const saved = await service.from("connected_client_sessions").update({
      access_token_hash: sha256Hex(accessToken), access_token_expires_at: new Date(session.expires_at * 1000).toISOString(),
      refresh_token_hash: sha256Hex(nextRefreshToken),
      refresh_token_family_hashes: [...tracked.refresh_token_family_hashes, sha256Hex(nextRefreshToken)],
      provider_session_ciphertext: encryptProviderSession({ session, proof: envelope.proof }, tracked.id),
      updated_at: new Date().toISOString(), last_refreshed_at: new Date().toISOString(),
    }).eq("id", tracked.id).eq("refresh_token_hash", lease).is("revoked_at", null).select("id").maybeSingle();
    if (saved.error || !saved.data) { await failRotation(); return reply({ error: "invalid_refresh_token" }, 401); }
    return reply(connectedCredentialPayload(session, tracked.scopes, accessToken, nextRefreshToken));
  }

  return reply({ error: "unsupported_grant_type" }, 400);
}
