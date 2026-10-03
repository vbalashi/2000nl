import { LIBRARY_PAGE_SIZE } from "./libraryPagination";
import type { LibrarySearchScope, LibrarySearchSummary } from "./librarySearchScope";
import { requestPlatformV2Lookup } from "./platformV2LookupTransport";
import { fetchDictionaryMeaningTranslation } from "@/lib/translation/translationApiClient";
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
  cardTypeId: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  signal?: AbortSignal;
  libraryScope?: LibrarySearchScope;
} & (
  | { query: string; entryId?: never; cursor?: string | null }
  | { entryId: string; query?: never; cursor?: never }
);

async function fetchPlatformV2LibraryLookupOnce(
  input: PlatformV2LibraryLookupInput,
): Promise<PlatformLookupV2Response & { librarySearch?: LibrarySearchSummary }> {
  const result = await requestPlatformV2Lookup({
    signal: input.signal,
    libraryScope: input.libraryScope,
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
    const transient = error instanceof PlatformV2LibraryLookupError
      ? error.kind === "http-error" && [408, 502, 503, 504].includes(error.status ?? 0)
      : error instanceof TypeError ||
        (error instanceof Error && error.message === "platform_request_timeout");
    if (!input.libraryScope || !transient || input.signal?.aborted) throw error;
    await waitForLibraryRetry(input.signal);
    return fetchPlatformV2LibraryLookupOnce(input);
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
    readonly kind: "http-error" | "contract-mismatch" | "invalid-cursor",
    readonly status?: number,
  ) {
    super(kind === "http-error" ? `lookup_http_${status}` : kind);
    this.name = "PlatformV2LibraryLookupError";
  }
}

export async function fetchPlatformV2LibraryGroupPage(input: {
  query: string;
  cardTypeId: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  cursor?: string | null;
  signal?: AbortSignal;
  libraryScope?: LibrarySearchScope;
}): Promise<PlatformV2LibraryGroupPage> {
  const payload = await fetchPlatformV2LibraryLookup({
    ...input,
    cursor: input.cursor ?? null,
  });
  const groups = input.libraryScope ? [...payload.groups] : payload.groups;
  let last = payload;
  const matchingEntryIds = [...(payload.librarySearch?.matchingEntryIds ?? [])];
  // The RPC bounds each atomic read to 25 groups. Combine cursor pages only
  // for the first-party Library; generic connected-client lookup is unchanged.
  while (input.libraryScope && last.page.nextGroupCursor && groups.length < LIBRARY_PAGE_SIZE) {
    const next = await fetchPlatformV2LibraryLookup({...input,cursor:last.page.nextGroupCursor});
    groups.push(...next.groups);
    matchingEntryIds.push(...(next.librarySearch?.matchingEntryIds ?? []));
    if (next.page.nextGroupCursor === last.page.nextGroupCursor) throw new Error("library_cursor_did_not_advance");
    last = next;
  }
  return {
    groups,
    ...(input.libraryScope?.filters && payload.librarySearch ? {librarySearch:{...payload.librarySearch,matchingEntryIds:[...new Set(matchingEntryIds)]}} : {}),
    selectedTierComplete: last.page.selectedTierComplete,
    nextGroupCursor: last.page.nextGroupCursor,
  };
}

export async function fetchPlatformV2LibraryGroup(input: {
  entryId: string;
  cardTypeId: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  signal?: AbortSignal;
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
}): Promise<PlatformHeadwordGroupV2 | null> {
  const payload = await fetchPlatformV2LibraryLookup({
    cardTypeId: input.cardTypeId,
    contentLanguageCode: input.contentLanguageCode,
    translationTargetLanguageCode: input.translationTargetLanguageCode,
    signal: input.signal,
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
  targetLanguageCode: string;
  force?: boolean;
}): Promise<"ready" | "pending" | "failed"> {
  const response = await fetchDictionaryMeaningTranslation({
    entryId: input.entryId,
    targetLanguageCode: input.targetLanguageCode,
    force: input.force,
  });
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
