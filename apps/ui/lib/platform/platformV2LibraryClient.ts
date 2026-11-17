import {authenticatedJsonHeaders} from "./platformV2Http";
import {platformFetchWithTimeout} from "./platformFetchWithTimeout";
import {isPlatformLookupV2Response} from "../../../../packages/shared/types/platformV2Runtime";
import type { CurrentTrainingCardContext } from "./trainingCurrentCardClient";
import { LIBRARY_PAGE_SIZE } from "./libraryPagination";
import type { LibrarySearchScope, LibrarySearchSummary } from "./librarySearchScope";
import { requestPlatformV2Lookup } from "./platformV2LookupTransport";
import { observeDictionaryMeaningTranslation } from "@/lib/translation/dictionaryTranslationObservation";
import type { CardTypeId } from "../../../../packages/shared/types/platform";
import type {
  PlatformHeadwordGroupV2,
  PlatformLookupV2Response,
} from "../../../../packages/shared/types/platformV2";

export type PlatformV2LibraryGroupPage = {
  groups: PlatformHeadwordGroupV2[];
  librarySearch?: LibrarySearchSummary;
  selectedTierComplete: boolean;
  nextGroupCursor: string | null;
};

type PlatformV2LibraryLookupInput = {
  expectedUserId?: string;
  cardTypeId: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  signal?: AbortSignal;
  libraryScope?: LibrarySearchScope;
  countOnly?: boolean;
} & (
  | { query: string; entryId?: never; cursor?: string | null }
  | { entryId: string; query?: never; cursor?: never }
);

async function fetchPlatformV2LibraryLookupOnce(
  input: PlatformV2LibraryLookupInput,
): Promise<PlatformLookupV2Response & { librarySearch?: LibrarySearchSummary }> {
  const result = await requestPlatformV2Lookup({
    signal: input.signal,
    ...(input.expectedUserId?{expectedUserId:input.expectedUserId}:{}),
    libraryScope: input.libraryScope,
    countOnly: input.countOnly,
    body: {
      ...(input.entryId !== undefined
        ? { entryId: input.entryId }
        : {
            query: input.query,
            ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
          }),
      cardTypeId: input.cardTypeId,
      contentLanguageCode: input.contentLanguageCode,
      translationTargetLanguageCode: input.translationTargetLanguageCode,
      intent: "dictionary-lookup",
    },
  });
  if (result.state === "http-error") {
    if (input.libraryScope && result.status === 404) {
      const error = await result.response.json().catch(() => null);
      if (error?.error === "material_not_accessible") throw new PlatformV2LibraryLookupError("material-unavailable",404);
    }
    if (input.libraryScope && result.status === 400) {
      const error = await result.response.json().catch(() => null);
      if (error?.error === "invalid_cursor") throw new PlatformV2LibraryLookupError("invalid-cursor",400);
    }
    throw new PlatformV2LibraryLookupError("http-error", result.status);
  }
  if (result.state === "contract-mismatch") {
    throw new PlatformV2LibraryLookupError("contract-mismatch");
  }
  return result.payload;
}

// Only first-party read-only Library calls recover automatically. Authentication,
// validation and schema errors require their owning boundary, not blind retries.
async function fetchPlatformV2LibraryLookup(input: PlatformV2LibraryLookupInput) {
  try {
    return await fetchPlatformV2LibraryLookupOnce(input);
  } catch (error) {
    // Never retain an admitted partial page after an account switch, even if
    // the continuation failed before the transport's successful-response check.
    if (input.expectedUserId && !input.signal?.aborted) await assertLibraryAccount(input.expectedUserId);
    const transient = error instanceof PlatformV2LibraryLookupError
      ? error.kind === "http-error" && [408, 502, 503, 504].includes(error.status ?? 0)
      : error instanceof TypeError ||
        (error instanceof Error && error.message === "platform_request_timeout");
    if (!input.libraryScope || !transient || input.signal?.aborted) throw error;
    await waitForLibraryRetry(input.signal);
    try {
      return await fetchPlatformV2LibraryLookupOnce(input);
    } catch (retryError) {
      // The retry can also fail before its successful-response account check.
      if (input.expectedUserId && !input.signal?.aborted) await assertLibraryAccount(input.expectedUserId);
      throw retryError;
    }
  }
}

async function assertLibraryAccount(expectedUserId: string): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      authenticatedJsonHeaders(expectedUserId),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("identity_timeout")), 2_000); }),
    ]);
  } catch {
    // If identity is unavailable, previously admitted rows cannot be retained.
    throw new Error("auth_account_changed");
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function waitForLibraryRetry(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, 250);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export class PlatformV2LibraryLookupError extends Error {
  constructor(
    readonly kind: "http-error" | "contract-mismatch" | "invalid-cursor" | "material-unavailable",
    readonly status?: number,
  ) {
    super(kind === "http-error" ? `lookup_http_${status}` : kind);
    this.name = "PlatformV2LibraryLookupError";
  }
}

/** Draft previews need the first page's exact total, never hydrated continuation pages. */
export async function readPlatformV2LibraryCounts(input: {
  query: string;
  cardTypeId: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  signal?: AbortSignal;
  libraryScope: LibrarySearchScope;
}): Promise<{totalGroups:number;totalMeanings?:number}> {
  const payload = await fetchPlatformV2LibraryLookup({...input, cursor: null, countOnly: true});
  if (!payload.librarySearch || !Number.isSafeInteger(payload.librarySearch.totalGroups) || payload.librarySearch.totalGroups < 0)
    throw new Error("library_count_unavailable");
  if (payload.librarySearch.totalMeanings !== undefined && (!Number.isSafeInteger(payload.librarySearch.totalMeanings) || payload.librarySearch.totalMeanings < payload.librarySearch.totalGroups || (payload.librarySearch.totalGroups === 0 && payload.librarySearch.totalMeanings !== 0)))
    throw new Error("library_count_unavailable");
  return {totalGroups:payload.librarySearch.totalGroups,...(payload.librarySearch.totalMeanings !== undefined?{totalMeanings:payload.librarySearch.totalMeanings}:{})};
}

/** Compatibility wrapper for consumers that only need article totals. */
export async function countPlatformV2LibraryGroups(input: Parameters<typeof readPlatformV2LibraryCounts>[0]):Promise<number> {
  return (await readPlatformV2LibraryCounts(input)).totalGroups;
}

export async function fetchPlatformV2LibraryGroupPage(input: {
  query: string;
  expectedUserId?: string;
  cardTypeId: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  cursor?: string | null;
  signal?: AbortSignal;
  libraryScope?: LibrarySearchScope;
  /** A validated first portion retained after a transient continuation failure. */
  resume?: PlatformV2LibraryGroupPage;
  onPartial?: (page: PlatformV2LibraryGroupPage) => void;
}): Promise<PlatformV2LibraryGroupPage> {
  const {resume, onPartial, ...request} = input;
  const payload = resume ? null : await fetchPlatformV2LibraryLookup({
    ...request,
    cursor: input.cursor ?? null,
  });
  const groups = resume ? [...resume.groups] : input.libraryScope ? [...payload!.groups] : payload!.groups;
  const summary = resume?.librarySearch ?? payload?.librarySearch;
  let nextGroupCursor = resume?.nextGroupCursor ?? payload?.page.nextGroupCursor ?? null;
  let selectedTierComplete = resume?.selectedTierComplete ?? payload!.page.selectedTierComplete;
  const matchingEntryIds = [...(summary?.matchingEntryIds ?? [])];
  const result = (): PlatformV2LibraryGroupPage => ({
    groups: input.libraryScope ? [...groups] : groups,
    ...((input.libraryScope?.filters || input.libraryScope?.material) && summary ? {librarySearch:{...summary,matchingEntryIds:[...new Set(matchingEntryIds)]}} : {}),
    selectedTierComplete,
    nextGroupCursor,
  });
  // The RPC bounds each atomic read to 25 groups. Combine cursor pages only
  // for the first-party Library; generic connected-client lookup is unchanged.
  if (!resume && input.libraryScope && nextGroupCursor && groups.length > 0 && groups.length < LIBRARY_PAGE_SIZE) onPartial?.(result());
  while (input.libraryScope && nextGroupCursor && groups.length < LIBRARY_PAGE_SIZE) {
    const cursor = nextGroupCursor;
    const next = await fetchPlatformV2LibraryLookup({...request,cursor});
    groups.push(...next.groups);
    matchingEntryIds.push(...(next.librarySearch?.matchingEntryIds ?? []));
    if (next.page.nextGroupCursor === cursor) throw new Error("library_cursor_did_not_advance");
    nextGroupCursor = next.page.nextGroupCursor;
    selectedTierComplete = next.page.selectedTierComplete;
  }
  return result();
}

export async function fetchPlatformV2LibraryGroup(input: {
  entryId: string;
  cardTypeId: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  signal?: AbortSignal;
  expectedUserId?: string;
}): Promise<PlatformHeadwordGroupV2 | null> {
  const payload = await fetchPlatformV2LibraryLookup(input);
  return selectPlatformV2LibraryGroup(payload, input.entryId);
}

export async function fetchPlatformV2CrossReferenceTarget(input: {
  query: string;
  sourceDictionaryId: string;
  targetHeadwordGroupId?: string | null;
  targetEntryId?: string | null;
  cardTypeId: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  signal?: AbortSignal;
  expectedUserId?: string;
}): Promise<PlatformHeadwordGroupV2 | null> {
  const payload = await fetchPlatformV2LibraryLookup({
    cardTypeId: input.cardTypeId,
    contentLanguageCode: input.contentLanguageCode,
    translationTargetLanguageCode: input.translationTargetLanguageCode,
    signal: input.signal,
    ...(input.expectedUserId?{expectedUserId:input.expectedUserId}:{}),
    ...(input.targetEntryId
      ? { entryId: input.targetEntryId }
      : { query: input.query }),
  });
  return selectPlatformV2CrossReferenceTarget(
    payload,
    input.query,
    input.sourceDictionaryId,
    input.targetHeadwordGroupId,
    input.targetEntryId,
  );
}

export async function requestPlatformV2LibraryTranslation(input: {
  entryId: string;
  currentCard?:CurrentTrainingCardContext;
  targetLanguageCode: string;
  force?: boolean;
  background?: boolean;
  signal?: AbortSignal;
}): Promise<"ready" | "pending" | "failed"> {
  const response = await observeDictionaryMeaningTranslation({
    entryId: input.entryId,
    ...(input.currentCard ? {currentCard:input.currentCard} : {}),
    targetLanguageCode: input.targetLanguageCode,
    force: input.force,
    background: input.background,
    signal: input.signal,
  });
  // A gateway timeout does not establish whether the origin finished writing
  // the overlay. Poll the same identity; the server lease prevents duplication.
  if (response.status === 504 || response.status === 524) return "pending";
  if (!response.ok) throw new Error("translation_failed");
  const payload = (await response.json().catch(() => null)) as {
    status?: "ready" | "pending" | "failed";
  } | null;
  return payload?.status ?? "failed";
}

export function selectPlatformV2LibraryGroup(
  payload: PlatformLookupV2Response,
  entryId: string,
): PlatformHeadwordGroupV2 | null {
  return (
    payload.groups.find((group) => {
      const selectedEntry = group.entries.find((entry) =>
        entry.kind === "sense-card"
          ? entry.entryId === entryId
          : entry.crossReferenceId === entryId,
      );
      if (!selectedEntry) return false;
      // Entry identity is authoritative. A one-sense group is still a complete
      // V2 Details target; group cardinality is presentation data, not a gate.
      return true;
    }) ?? null
  );
}

export function selectPlatformV2CrossReferenceTarget(
  payload: PlatformLookupV2Response,
  query: string = payload.query,
  sourceDictionaryId?: string,
  targetHeadwordGroupId?: string | null,
  targetEntryId?: string | null,
): PlatformHeadwordGroupV2 | null {
  if (targetHeadwordGroupId) {
    return (
      payload.groups.find(
        (group) => group.headwordGroupId === targetHeadwordGroupId,
      ) ?? null
    );
  }
  if (targetEntryId) {
    return (
      payload.groups.find((group) =>
        group.entries.some(
          (entry) =>
            entry.kind === "sense-card" && entry.entryId === targetEntryId,
        ),
      ) ?? null
    );
  }
  if (payload.page.selectedTierComplete !== true) return null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const exactGroups = payload.groups.filter(
      (group) =>
        group.header.text.trim().toLocaleLowerCase() === normalizedQuery &&
        (!sourceDictionaryId ||
          group.dictionary.dictionaryId === sourceDictionaryId) &&
        group.entries.some((entry) => entry.kind === "sense-card"),
  );
  return exactGroups.length === 1 ? exactGroups[0] : null;
}

/** Bounded first-party hydration; authority is rechecked by the server. */
export async function fetchPlatformV2LibraryGroups(input: {
  entryIds: string[]; contentLanguageCode: string; expectedUserId?: string; signal: AbortSignal;
}): Promise<PlatformHeadwordGroupV2[]> {
  input.signal.throwIfAborted();
  const response = await platformFetchWithTimeout("/api/library/articles", {
    method: "POST", cache: "no-store", signal: input.signal,
    headers: await authenticatedJsonHeaders(input.expectedUserId),
    body: JSON.stringify({entryIds: input.entryIds, languageCode: input.contentLanguageCode}),
  });
  if (input.expectedUserId) await authenticatedJsonHeaders(input.expectedUserId);
  input.signal.throwIfAborted();
  if ([401,403,404].includes(response.status)) throw new Error("dictionary_search_access_changed");
  const payload = await response.json();
  if (!response.ok || !isPlatformLookupV2Response(payload) || payload.groups.length > 25)
    throw new Error("dictionary_search_article_unavailable");
  return payload.groups;
}
