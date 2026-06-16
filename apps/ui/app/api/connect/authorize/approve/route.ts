import { NextRequest } from "next/server";
import {
  connectCorsPreflight,
  createServiceClient,
  getWebUser,
  loadConnectedClient,
  normalizeRedirectUri,
  parseScopes,
  randomOpaqueToken,
  sha256Hex,
  upsertGrant,
  validateRedirectUri,
  validateScopes,
  withConnectCors,
} from "@/lib/connect/connectServer";
import { jsonNoStore } from "@/lib/platform/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApproveBody = {
  clientId?: unknown;
  redirectUri?: unknown;
  scope?: unknown;
  state?: unknown;
  codeChallenge?: unknown;
  codeChallengeMethod?: unknown;
};

async function readJson(request: NextRequest): Promise<ApproveBody | null> {
  try {
    return (await request.json()) as ApproveBody;
  } catch {
    return null;
  }
}

export function OPTIONS(request: NextRequest) {
  return connectCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  const reply = (payload: unknown, status = 200) =>
    withConnectCors(request, jsonNoStore(payload, status));

  const user = await getWebUser(request);
  if (user instanceof Response) return withConnectCors(request, user);
  if (!user.email) {
    return reply({ error: "user_email_required" }, 400);
  }

  const body = await readJson(request);
  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
  if (!clientId) {
    return reply({ error: "missing_client_id" }, 400);
  }

  const service = createServiceClient();
  if (service instanceof Response) return withConnectCors(request, service);

  const client = await loadConnectedClient(service, clientId);
  if (client instanceof Response) return withConnectCors(request, client);

  const redirectUri = normalizeRedirectUri(body?.redirectUri);
  if (!validateRedirectUri(client, redirectUri)) {
    return reply({ error: "redirect_uri_not_allowed" }, 400);
  }

  const scopesResult = validateScopes(parseScopes(body?.scope), client.allowed_scopes);
  if (!scopesResult.ok) {
    return reply({ error: scopesResult.error }, 400);
  }

  const codeChallenge =
    typeof body?.codeChallenge === "string" ? body.codeChallenge.trim() : "";
  const codeChallengeMethod =
    typeof body?.codeChallengeMethod === "string"
      ? body.codeChallengeMethod.trim()
      : "S256";

  if (client.requires_pkce && (!codeChallenge || codeChallengeMethod !== "S256")) {
    return reply({ error: "pkce_required" }, 400);
  }

  const grantError = await upsertGrant({
    supabase: service,
    clientId,
    userId: user.id,
    scopes: scopesResult.scopes,
  });
  if (grantError) return withConnectCors(request, grantError);

  const code = randomOpaqueToken(32);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { error } = await service.from("connect_authorization_codes").insert({
    code_hash: sha256Hex(code),
    client_id: clientId,
    user_id: user.id,
    user_email: user.email,
    redirect_uri: redirectUri,
    scopes: scopesResult.scopes,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    expires_at: expiresAt,
  });

  if (error) {
    return reply({ error: "authorization_code_save_failed", detail: error.message }, 500);
  }

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  const state = typeof body?.state === "string" ? body.state : "";
  if (state) redirect.searchParams.set("state", state);

  return reply({ redirectTo: redirect.href, expiresAt });
}
