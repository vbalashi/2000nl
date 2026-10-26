import type { AuthenticatedSupabase } from "./serverSupabase";
import type { DictionaryLookupPayload } from "./lookupService";
import { contentFingerprint, normalizeDictionaryContent } from "./projections/dictionaryContent";

/** A content/provider/cache request can outlive a share, licence or source revision.
 * Re-read through the caller's live entry gate before emitting its result.
 * Current-card requests have their own exact permit boundary instead.
 */
export async function dictionaryEntrySourceStillReadable(
  auth: Pick<AuthenticatedSupabase, "supabase">,
  original: DictionaryLookupPayload,
): Promise<boolean> {
  try {
    const { data, error } = await auth.supabase.rpc("fetch_dictionary_entry_by_id_gated", {
      p_entry_id: original.id,
    });
    if (error || !data?.raw || data.id !== original.id) return false;
    if (String(data.content_version ?? "") !== String(original.content_version ?? "")) return false;
    return data.dictionary_id === original.dictionary_id
      && data.language_code === original.language_code
      && contentFingerprint(normalizeDictionaryContent(data)) === contentFingerprint(normalizeDictionaryContent(original));
  } catch {
    return false;
  }
}
