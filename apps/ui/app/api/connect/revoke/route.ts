import { NextRequest } from "next/server";
import {
  connectCorsPreflight,
  createServiceClient,
  sha256Hex,
  withConnectCors,
} from "@/lib/connect/connectServer";
import { jsonNoStore } from "@/lib/platform/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RevokeBody = {
  client_id?: unknown;
  refresh_token?: unknown;
};

async function readJson(request: NextRequest): Promise<RevokeBody | null> {
  try {
    return (await request.json()) as RevokeBody;
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

  const body = await readJson(request);
  const clientId = typeof body?.client_id === "string" ? body.client_id.trim() : "";
  const refreshToken =
    typeof body?.refresh_token === "string" ? body.refresh_token.trim() : "";

  if (!clientId) return reply({ error: "missing_client_id" }, 400);
  if (!refreshToken) return reply({ error: "missing_refresh_token" }, 400);

  const service = createServiceClient();
  if (service instanceof Response) return withConnectCors(request, service);

  const { error } = await service
    .from("connected_client_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .eq("refresh_token_hash", sha256Hex(refreshToken));

  if (error) {
    return reply({ error: "revoke_failed", detail: error.message }, 500);
  }

  return reply({ revoked: true });
}
