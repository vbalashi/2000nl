import type { LibraryEntryFilters, LibraryMaterialScope } from "./librarySearchScope";
import { authenticatedJsonHeaders } from "./platformV2Http";
import { platformFetchWithTimeout } from "./platformFetchWithTimeout";
import { fetchPlatformV2LibraryGroup } from "./platformV2LibraryClient";
import { buildLibraryHeadwordGroupResults } from "@/components/training/wordlist/libraryHeadwordGroupResults";
import type { PlatformHeadwordGroupV2 } from "../../../../packages/shared/types/platformV2";

export type DictionarySearchCategory = "headwords" | "examples" | "definitions" | "alphabetical";
export const DICTIONARY_SEARCH_CATEGORIES: DictionarySearchCategory[] = ["headwords", "examples", "definitions", "alphabetical"];
export type DictionaryCategoryHit = {
  resultKey?: string;
  entry: { id: string; headword: string; languageCode?: string; summaryDefinition?: string };
  dictionary?: { id?: string; name?: string };
  displayText?: string;
  field?: { text?: string; sourcePath?: string };
  match?: { matchedText?: string; sourcePath?: string; relation?: string };
};
export type DictionaryCategoryPage = {
  id: DictionarySearchCategory;
  total: number | null;
  unavailableEntryCount?: number;
  count?: { value: number | null; relation: string };
  page: { hasMore: boolean; nextCursor: string | null };
  items: DictionaryCategoryHit[];
};
export type DictionaryCategoryScope = {
  query: string;
  languageCode: string;
  dictionaryId: string | null;
  userId?: string;
  filters?: LibraryEntryFilters;
  material?: LibraryMaterialScope;
  signal: AbortSignal;
};

export async function fetchDictionaryCategoryPage(scope: DictionaryCategoryScope, category: DictionarySearchCategory, cursor: string | null = null): Promise<DictionaryCategoryPage> {
  scope.signal.throwIfAborted();
  const response = await platformFetchWithTimeout("/api/library/category-search", {
    method: "POST", cache: "no-store", signal: scope.signal,
    headers: await authenticatedJsonHeaders(scope.userId),
    body: JSON.stringify({ query: scope.query, languageCode: scope.languageCode,
      dictionaryIds: scope.material ? null : scope.dictionaryId ? [scope.dictionaryId] : null,
      filters: scope.filters, material: scope.material,
      group: category, cursor, limit: category === "alphabetical" ? 31 : 100 }),
  });
  const payload = await response.json();
  if (scope.userId) await authenticatedJsonHeaders(scope.userId);
  if (payload?.error) throw new Error(payload.error);
  const page = payload?.groups?.[0];
  if (!response.ok || page?.id !== category || !Array.isArray(page.items) || !page.page ||
    page.items.some((item: DictionaryCategoryHit) => !item?.entry?.id || typeof item.entry.headword !== "string")) throw new Error("dictionary_search_failed");
  return { ...page, unavailableEntryCount: payload.unavailableEntryCount ?? 0 };
}

/** Drain bounded cursor pages automatically; each category owns its cancellation. */
export async function readDictionaryCategory(scope: DictionaryCategoryScope, category: DictionarySearchCategory,
  onPage: (page: DictionaryCategoryPage, complete: boolean) => void,
): Promise<DictionaryCategoryPage> {
  let cursor: string | null = null;
  const seenCursors = new Set<string>();
  const items: DictionaryCategoryHit[] = [];
  const seenHits = new Set<string>();
  while (true) {
    scope.signal.throwIfAborted();
    const page = await fetchDictionaryCategoryPage(scope, category, cursor);
    scope.signal.throwIfAborted();
    for (const item of page.items) {
      const key = item.resultKey ?? JSON.stringify([item.entry.id, item.field?.sourcePath ?? item.match?.sourcePath ?? ""]);
      if (!seenHits.has(key)) { seenHits.add(key); items.push(item); }
    }
    // Alphabetical is a centered neighborhood, not every later dictionary word.
    const complete = category === "alphabetical" || !page.page.hasMore;
    const result = { ...page, items: [...items] };
    onPage(result, complete);
    if (complete) return result;
    cursor = page.page.nextCursor;
    if (!cursor || seenCursors.has(cursor)) throw new Error("dictionary_search_cursor_did_not_advance");
    seenCursors.add(cursor);
  }
}

/** Reuse authoritative V2 article metadata and the normal Library projection.
 * A per-read cache absorbs sibling senses without merging distinct homographs.
 */
export async function hydrateDictionaryWordResults(scope: DictionaryCategoryScope, hits: DictionaryCategoryHit[]) {
  const groups: PlatformHeadwordGroupV2[] = [];
  const groupIds = new Set<string>();
  const entryIds = new Set<string>();
  let remaining = hits;
  while (remaining.length) {
    scope.signal.throwIfAborted();
    const batch = remaining.slice(0, 4);
    const loaded = await Promise.all(batch.map(item => fetchPlatformV2LibraryGroup({
      entryId: item.entry.id, cardTypeId: "word-to-definition",
      contentLanguageCode: scope.languageCode, translationTargetLanguageCode: null,
      expectedUserId: scope.userId, signal: scope.signal,
    })));
    scope.signal.throwIfAborted();
    for (const group of loaded) {
      if (!group) throw new Error("dictionary_search_article_unavailable");
      for (const entry of group.entries) entryIds.add(entry.kind === "sense-card" ? entry.entryId : entry.crossReferenceId);
      if (!groupIds.has(group.headwordGroupId)) { groupIds.add(group.headwordGroupId); groups.push(group); }
    }
    remaining = remaining.slice(batch.length).filter(item => !entryIds.has(item.entry.id));
  }
  return buildLibraryHeadwordGroupResults(groups, hits.map(item => item.entry.id));
}
