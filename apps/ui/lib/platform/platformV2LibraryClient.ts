import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
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
): Promise<PlatformLookupV2Response | null> {
  const response = await fetch("/api/platform/v2/lookup", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal: input.signal,
    headers: await platformV2AuthenticatedJsonHeaders(),
    body: JSON.stringify({
      query: input.query,
      cardTypeId: input.cardTypeId,
      contentLanguageCode: input.contentLanguageCode,
      translationTargetLanguageCode: input.translationTargetLanguageCode,
      intent: "dictionary-lookup",
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    }),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as PlatformLookupV2Response;
  return payload.contractVersion === "platform-lookup-v2" ? payload : null;
}

export async function fetchPlatformV2LibraryGroupPage(input: {
  query: string;
  cardTypeId: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  cursor?: string | null;
  signal?: AbortSignal;
}): Promise<PlatformV2LibraryGroupPage | null> {
  const payload = await fetchPlatformV2LibraryLookup({
    ...input,
    cursor: input.cursor ?? null,
  });
  if (!payload || !Array.isArray(payload.groups)) return null;
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
  if (!payload) return null;
  return selectPlatformV2MultiSenseGroup(payload, input.entryId);
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
    payload.groups.find(
      (group) =>
        group.senseCount > 1 &&
        group.entries.some(
          (entry) => entry.kind === "sense-card" && entry.entryId === entryId,
        ),
    ) ?? null
  );
}
