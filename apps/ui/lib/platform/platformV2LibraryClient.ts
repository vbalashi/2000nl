import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
import type { CardTypeId } from "../../../../packages/shared/types/platform";
import type {
  PlatformHeadwordGroupV2,
  PlatformLookupV2Response,
} from "../../../../packages/shared/types/platformV2";

export async function fetchPlatformV2MultiSenseGroup(input: {
  query: string;
  entryId: string;
  cardTypeId: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  signal?: AbortSignal;
}): Promise<PlatformHeadwordGroupV2 | null> {
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
    }),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as PlatformLookupV2Response;
  if (payload.contractVersion !== "platform-lookup-v2") return null;
  return selectPlatformV2MultiSenseGroup(payload, input.entryId);
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
