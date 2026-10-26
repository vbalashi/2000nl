import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLabelsSnapshot, type CollectionLabelOperation } from "./model";

const knownErrors = new Set([
  "unauthorized",
  "label_catalog_conflict",
  "label_not_found",
  "collection_not_found",
  "label_cycle",
  "label_depth_limit",
  "label_catalog_limit",
  "invalid_label_operation",
]);
export class CollectionLabelsError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
/** Request-bound authenticated client; never an admin client or browser-side table writes. */
export function createCollectionLabelsRepository(client: SupabaseClient) {
  async function call(name: string, args: Record<string, unknown>) {
    const { data, error } = await client
      .rpc(name, args)
      .abortSignal(AbortSignal.timeout(10000));
    if (error) {
      const code = [...knownErrors].find(
        (candidate) => error.message === candidate,
      );
      throw new CollectionLabelsError(code ?? "collection_labels_unavailable");
    }
    const snapshot = parseLabelsSnapshot(data);
    if (!snapshot)
      throw new CollectionLabelsError("collection_labels_unavailable");
    return snapshot;
  }
  return {
    load: (userId: string) =>
      call("read_collection_labels_v1", { p_user_id: userId }),
    mutate: (
      userId: string,
      expectedRevision: number,
      operation: CollectionLabelOperation,
    ) =>
      call("mutate_collection_labels_v1", {
        p_user_id: userId,
        p_expected_revision: expectedRevision,
        p_operation: operation,
      }),
  };
}
