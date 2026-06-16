import { NextRequest } from "next/server";
import {
  CONNECT_SCOPES,
  connectCorsPreflight,
  createServiceClient,
  loadConnectedClient,
  normalizeRedirectUri,
  parseScopes,
  validateRedirectUri,
  validateScopes,
  withConnectCors,
} from "@/lib/connect/connectServer";
import { jsonNoStore } from "@/lib/platform/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request: NextRequest) {
  return connectCorsPreflight(request);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } },
) {
  const reply = (payload: unknown, status = 200) =>
    withConnectCors(request, jsonNoStore(payload, status));

  const service = createServiceClient();
  if (service instanceof Response) return withConnectCors(request, service);

  const client = await loadConnectedClient(service, params.clientId);
  if (client instanceof Response) return withConnectCors(request, client);

  const url = new URL(request.url);
  const redirectUri = normalizeRedirectUri(url.searchParams.get("redirect_uri"));
  if (!validateRedirectUri(client, redirectUri)) {
    return reply({ error: "redirect_uri_not_allowed" }, 400);
  }

  const requestedScopes = parseScopes(url.searchParams.get("scope"));
  const scopeResult = validateScopes(requestedScopes, client.allowed_scopes);
  if (!scopeResult.ok) {
    return reply({ error: scopeResult.error }, 400);
  }

  return reply({
    clientId: client.client_id,
    displayName: client.display_name,
    clientType: client.client_type,
    redirectUri,
    scopes: scopeResult.scopes.map((scope) => ({
      id: scope,
      label: CONNECT_SCOPES[scope],
    })),
    requiresPkce: client.requires_pkce,
  });
}
