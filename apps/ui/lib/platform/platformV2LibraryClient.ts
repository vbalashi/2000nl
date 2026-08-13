import { requestPlatformV2Lookup } from "./platformV2LookupTransport";
import { translationRequestHeaders } from "@/lib/translation/translationApiClient";
import type { CardTypeId } from "../../../../packages/shared/types/platform";
import type {
  PlatformHeadwordGroupV2,
  PlatformLookupV2Response,
} from "../../../../packages/shared/types/platformV2";

export type PlatformV2LibraryGroupPage = {
  groups: PlatformHeadwordGroupV2[];
  selectedTierComplete: boolean;
  nextGroupCursor: string | null;
};

type PlatformV2LibraryLookupInput = {
  query: string;
  cardTypeId: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  cursor?: string | null;
  signal?: AbortSignal;
};

async function fetchPlatformV2LibraryLookup(
  input: PlatformV2LibraryLookupInput,
): Promise<PlatformLookupV2Response> {
  const result = await requestPlatformV2Lookup({
    signal: input.signal,
    body: {
      query: input.query,
      cardTypeId: input.cardTypeId,
      contentLanguageCode: input.contentLanguageCode,
      translationTargetLanguageCode: input.translationTargetLanguageCode,
      intent: "dictionary-lookup",
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    },
  });
  if (result.state === "http-error") {
    throw new PlatformV2LibraryLookupError("http-error", result.status);
  }
  if (result.state === "contract-mismatch") {
    throw new PlatformV2LibraryLookupError("contract-mismatch");
  }
  return result.payload;
}

export class PlatformV2LibraryLookupError extends Error {
  constructor(
    readonly kind: "http-error" | "contract-mismatch",
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
}): Promise<PlatformV2LibraryGroupPage> {
  const payload = await fetchPlatformV2LibraryLookup({
    ...input,
    cursor: input.cursor ?? null,
  });
  return {
    groups: payload.groups,
    selectedTierComplete: payload.page.selectedTierComplete,
    nextGroupCursor: payload.page.nextGroupCursor,
  };
}

export async function fetchPlatformV2MultiSenseGroup(input: {
  query: string;
  entryId: string;
  cardTypeId: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  signal?: AbortSignal;
}): Promise<PlatformHeadwordGroupV2 | null> {
  const payload = await fetchPlatformV2LibraryLookup(input);
  return selectPlatformV2MultiSenseGroup(payload, input.entryId);
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
  const payload = await fetchPlatformV2LibraryLookup(input);
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
  const response = await fetch(
    `/api/translation?word_id=${encodeURIComponent(input.entryId)}&lang=${encodeURIComponent(input.targetLanguageCode)}${input.force ? "&force=1" : ""}`,
    {
      cache: "no-store",
      credentials: "same-origin",
      headers: await translationRequestHeaders(),
    },
  );
  if (!response.ok) throw new Error("translation_failed");
  const payload = (await response.json().catch(() => null)) as {
    status?: "ready" | "pending" | "failed";
  } | null;
  return payload?.status ?? "failed";
}

export function selectPlatformV2MultiSenseGroup(
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
      if (selectedEntry.kind === "cross-reference") return true;
      return (
        group.senseCount > 1 ||
        group.entries.some((entry) => entry.kind === "cross-reference")
      );
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
