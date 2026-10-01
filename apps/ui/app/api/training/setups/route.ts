import { readBoundedJson } from "@/lib/http/readBoundedJson";
import { NextRequest } from "next/server";
import { getAuthenticatedSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";
import { MAX_TRAINING_SETUPS_BYTES, parseTrainingSetupsDocument, parseTrainingSetupsSnapshot } from "@/lib/training/setups/model";
import { readAccountTrainingSetups } from "@/lib/training/setups/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function accountAuth(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  return auth.principal.authKind === "first_party"
    ? auth : jsonNoStore({ error: "first_party_required" }, 403);
}

export async function GET(request: NextRequest) {
  const auth = await accountAuth(request);
  if (auth instanceof Response) return auth;
  const snapshot = await readAccountTrainingSetups(auth.supabase, auth.user.id);
  return snapshot ? jsonNoStore(snapshot) : jsonNoStore({ error: "training_setups_unavailable" }, 503);
}

export async function PUT(request: NextRequest) {
  const auth = await accountAuth(request);
  if (auth instanceof Response) return auth;
  const parsed = await readBoundedJson(request, MAX_TRAINING_SETUPS_BYTES);
  if ("error" in parsed) return jsonNoStore({error: parsed.error === "too_large" ? "training_setups_too_large" : "invalid_training_setups"}, parsed.error === "too_large" ? 413 : 400);
  const body = parsed.body;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return jsonNoStore({ error: "invalid_training_setups" }, 400);
  }
  const input = body as Record<string, unknown>;
  const document = parseTrainingSetupsDocument(input.document);
  const revision = input.expectedRevision;
  if (!document || typeof revision !== "number" || !Number.isInteger(revision) || revision < 0 || revision >= 2147483647) {
    return jsonNoStore({ error: "invalid_training_setups" }, 400);
  }
  const { data, error } = await auth.supabase.rpc("save_account_training_setups_v1", {
    p_expected_revision: revision, p_document: document,
  });
  if (error) return jsonNoStore({ error: "training_setups_unavailable" }, 503);
  const snapshot = parseTrainingSetupsSnapshot(data);
  if (!snapshot || typeof data?.conflict !== "boolean") return jsonNoStore({ error: "training_setups_unavailable" }, 503);
  return data.conflict ? jsonNoStore({ error: "training_setups_conflict", snapshot }, 409) : jsonNoStore(snapshot);
}
