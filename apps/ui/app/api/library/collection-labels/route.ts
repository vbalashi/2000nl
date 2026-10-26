import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
} from "@/lib/platform/serverSupabase";
import { readBoundedJson } from "@/lib/http/readBoundedJson";
import {
  MAX_LABEL_REQUEST_BYTES,
  parseLabelMutation,
} from "@/lib/collections/labels/model";
import {
  CollectionLabelsError,
  createCollectionLabelsRepository,
} from "@/lib/collections/labels/repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
async function authenticate(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  return auth.principal.authKind === "first_party"
    ? auth
    : jsonNoStore({ error: "first_party_required" }, 403);
}
function failure(error: unknown) {
  const code =
    error instanceof CollectionLabelsError
      ? error.code
      : "collection_labels_unavailable";
  const status =
    code === "unauthorized"
      ? 403
      : code === "label_catalog_conflict"
        ? 409
        : ["label_not_found", "collection_not_found"].includes(code)
          ? 404
          : [
                "label_cycle",
                "label_depth_limit",
                "label_catalog_limit",
                "invalid_label_operation",
              ].includes(code)
            ? 400
            : 503;
  return jsonNoStore({ error: code }, status);
}
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  try {
    return jsonNoStore(
      await createCollectionLabelsRepository(auth.supabase).load(auth.user.id),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  const body = await readBoundedJson(request, MAX_LABEL_REQUEST_BYTES);
  if ("error" in body)
    return jsonNoStore(
      {
        error:
          body.error === "too_large"
            ? "collection_labels_too_large"
            : "invalid_label_operation",
      },
      body.error === "too_large" ? 413 : 400,
    );
  const input = parseLabelMutation(body.body);
  if (!input) return jsonNoStore({ error: "invalid_label_operation" }, 400);
  try {
    return jsonNoStore(
      await createCollectionLabelsRepository(auth.supabase).mutate(
        auth.user.id,
        input.expectedRevision,
        input.operation,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
