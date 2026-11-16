import type { LibraryEntryFilters, LibraryMaterialScope } from "./librarySearchScope";
import { authenticatedJsonHeaders } from "./platformV2Http";
import { platformFetchWithTimeout } from "./platformFetchWithTimeout";
import { fetchPlatformV2LibraryGroups } from "./platformV2LibraryClient";
import { buildLibraryHeadwordGroupResults } from "@/components/training/wordlist/libraryHeadwordGroupResults";

export type DictionarySearchCategory = "headwords" | "examples" | "definitions" | "alphabetical";
export const DICTIONARY_SEARCH_CATEGORIES: DictionarySearchCategory[] = ["headwords", "examples", "definitions", "alphabetical"];
export const CONTEXT_SEARCH_PAGE_SIZE = 50;
export const WORD_SEARCH_PAGE_SIZE = 25;
export type DictionaryCategoryHit = {
  resultKey?: string;
  headwordGroupId?: string;
  entry: { id: string; headword: string; languageCode?: string; summaryDefinition?: string };
  dictionary?: { id?: string; name?: string };
  displayText?: string;
  field?: { text?: string; sourcePath?: string };
  match?: { matchedText?: string; sourcePath?: string; relation?: string };
};
export type DictionaryCategoryPage = {
  id: DictionarySearchCategory;
  total: number | null;
  wordGroupCount?:number;
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
      group: category, cursor, limit: category === "alphabetical" ? 31 : category === "headwords" ? WORD_SEARCH_PAGE_SIZE : CONTEXT_SEARCH_PAGE_SIZE }),
  });
  if (scope.userId) await authenticatedJsonHeaders(scope.userId);
  if ([401,403,404].includes(response.status)) throw new Error("dictionary_search_access_changed");
  const payload = await response.json();
  if (payload?.error) throw new Error(payload.error);
  const page = payload?.groups?.[0];
  if (!response.ok || page?.id !== category || !Array.isArray(page.items) || !page.page ||
    page.items.some((item: DictionaryCategoryHit) => !item?.entry?.id || typeof item.entry.headword !== "string")) throw new Error("dictionary_search_failed");
  if ((category === "headwords" || category === "alphabetical") &&
      ((page.total !== undefined && page.total !== null && (!Number.isSafeInteger(page.total) || page.total < 0 || (page.wordGroupCount !== undefined && (page.total < page.wordGroupCount || (page.wordGroupCount === 0 && page.total !== 0))))) ||
       (page.wordGroupCount !== undefined && (!Number.isSafeInteger(page.wordGroupCount) || page.wordGroupCount < 0))))
    throw new Error("dictionary_search_failed");
  return { ...page, unavailableEntryCount: payload.unavailableEntryCount ?? 0 };
}

/** Every category publishes one bounded page; continuation is a user action. */
export async function readDictionaryCategory(scope: DictionaryCategoryScope, category: DictionarySearchCategory,
  onPage: (page: DictionaryCategoryPage, complete: boolean) => void,
): Promise<DictionaryCategoryPage> {
  const page = await fetchDictionaryCategoryPage(scope, category);
  scope.signal.throwIfAborted();
  onPage(page, true);
  return page;
}

/** One explicit continuation; never enumerate unseen context matches for a count. */
export async function readMoreDictionaryContext(scope: DictionaryCategoryScope, previous: DictionaryCategoryPage): Promise<DictionaryCategoryPage> {
  if (!previous.page.hasMore) return previous;
  if (!previous.page.nextCursor) throw new Error("dictionary_search_cursor_did_not_advance");
  const cursor = previous.page.nextCursor;
  const next = await fetchDictionaryCategoryPage(scope, previous.id, cursor);
  scope.signal.throwIfAborted();
  if (next.page.hasMore && (!next.page.nextCursor || next.page.nextCursor === cursor)) throw new Error("dictionary_search_cursor_did_not_advance");
  const seen = new Set(previous.items.map(hit => hit.resultKey ?? JSON.stringify([hit.entry.id, hit.field?.sourcePath ?? hit.match?.sourcePath ?? ""])));
  const items = [...previous.items];
  for (const hit of next.items) {
    const key = hit.resultKey ?? JSON.stringify([hit.entry.id, hit.field?.sourcePath ?? hit.match?.sourcePath ?? ""]);
    if (!seen.has(key)) { seen.add(key); items.push(hit); }
  }
  return {...next, items};
}

/** Reuse this scope's articles by canonical identity, retaining matching senses
 * across cursor boundaries that split siblings. No spelling-based merging.
 */
export async function hydrateDictionaryWordResults(scope: DictionaryCategoryScope, hits: DictionaryCategoryHit[],
  previous: readonly ReturnType<typeof buildLibraryHeadwordGroupResults>[number][] = []) {
  const groups = new Map(previous.map(row => [row.headwordGroupId, row.group]));
  const representatives = new Map<string, string>();
  for (const hit of hits) {
    if (!hit.headwordGroupId) throw new Error("dictionary_search_identity_missing");
    const cached = groups.get(hit.headwordGroupId);
    if (cached && !cached.entries.some(entry =>
      (entry.kind === "sense-card" ? entry.entryId : entry.crossReferenceId) === hit.entry.id))
      throw new Error("invalid_cursor");
    if (!groups.has(hit.headwordGroupId) && !representatives.has(hit.headwordGroupId))
      representatives.set(hit.headwordGroupId, hit.entry.id);
  }
  const pending = [...representatives];
  for (let offset = 0; offset < pending.length; offset += WORD_SEARCH_PAGE_SIZE) {
    scope.signal.throwIfAborted();
    const batch = pending.slice(offset, offset + WORD_SEARCH_PAGE_SIZE);
    const loaded = await fetchPlatformV2LibraryGroups({entryIds: batch.map(([, id]) => id),
      contentLanguageCode: scope.languageCode, expectedUserId: scope.userId, signal: scope.signal});
    scope.signal.throwIfAborted();
    if (loaded.length !== batch.length || batch.some(([id, entryId]) => !loaded.some(group =>
      group.headwordGroupId === id && group.entries.some(entry =>
        (entry.kind === "sense-card" ? entry.entryId : entry.crossReferenceId) === entryId))))
      throw new Error("invalid_cursor");
    for (const group of loaded) groups.set(group.headwordGroupId, group);
  }
  const ids = [...new Set(hits.map(hit => hit.headwordGroupId!))];
  return buildLibraryHeadwordGroupResults(ids.map(id => groups.get(id)!), hits.map(hit => hit.entry.id));
}

/** Exact article totals are computed with existing server identities, without article hydration. */
export async function countDictionaryCategory(scope:DictionaryCategoryScope,category:DictionarySearchCategory){
 if(category==="headwords"||category==="alphabetical"){
  const page=await fetchDictionaryCategoryPage(scope,category);
  if(!Number.isSafeInteger(page.wordGroupCount)||page.wordGroupCount!<0)throw new Error("library_count_unavailable");
  return page.wordGroupCount!;
 }
 return (await readDictionaryCategory(scope,category,()=>{})).items.length;
}

/** Word categories already return exact article and selected-meaning metadata. */
export async function readDictionaryCategoryCounts(scope:DictionaryCategoryScope,category:DictionarySearchCategory){
 const page=await fetchDictionaryCategoryPage(scope,category);
 if(!Number.isSafeInteger(page.wordGroupCount)||page.wordGroupCount!<0)throw new Error("library_count_unavailable");
 if(page.total!==null&&page.total!==undefined&&(!Number.isSafeInteger(page.total)||page.total<0))throw new Error("library_count_unavailable");
 return {totalGroups:page.wordGroupCount!,...(page.total!=null?{totalMeanings:page.total}:{})};
}
