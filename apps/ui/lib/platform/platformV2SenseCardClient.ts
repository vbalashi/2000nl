import type {
  PlatformActionV2Request,
  PlatformActionV2Response,
  PlatformHeadwordGroupV2,
  PlatformLookupV2Response,
  PlatformSenseCardCapabilityV2,
  PlatformSenseCardEntryV2,
} from "../../../../packages/shared/types/platformV2";
import type { CardTypeId } from "../../../../packages/shared/types/platform";
import { supabase } from "@/lib/supabaseClient";

export type PlatformV2SingleSenseResult = {
  group: PlatformHeadwordGroupV2;
  entry: PlatformSenseCardEntryV2;
};

export async function fetchPlatformV2SingleSense(input: {
  query: string;
  entryId: string;
  cardTypeId: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  signal?: AbortSignal;
}): Promise<PlatformV2SingleSenseResult | null> {
  const response = await fetch("/api/platform/v2/lookup", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal: input.signal,
    headers: await authenticatedJsonHeaders(),
    body: JSON.stringify({
      query: input.query,
      cardTypeId: input.cardTypeId,
      contentLanguageCode: input.contentLanguageCode,
      translationTargetLanguageCode: input.translationTargetLanguageCode,
      intent: "learning",
    }),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as PlatformLookupV2Response;
  if (payload.contractVersion !== "platform-lookup-v2") return null;

  for (const group of payload.groups) {
    if (group.senseCount !== 1) continue;
    const candidate = group.entries.find(
      (item): item is PlatformSenseCardEntryV2 =>
        item.kind === "sense-card" && item.entryId === input.entryId,
    );
    if (candidate) return { group, entry: candidate };
  }
  return null;
}

export async function performPlatformV2CardAction(
  capability: Extract<
    PlatformSenseCardCapabilityV2,
    {
      actionId:
        | "start-learning"
        | "mark-known"
        | "undo-known"
        | "review-card";
    }
  >,
): Promise<PlatformActionV2Response> {
  const clientEventId = crypto.randomUUID();
  let request: PlatformActionV2Request;
  if (capability.actionId === "review-card") {
    request = {
      actionId: "review-card",
      clientEventId,
      target: capability.target,
      reviewResult: capability.reviewResult,
    };
  } else if (capability.actionId === "undo-known") {
    request = {
      actionId: "undo-known",
      clientEventId,
      target: capability.target,
    };
  } else {
    request = {
      actionId: capability.actionId,
      clientEventId,
      target: capability.target,
    };
  }
  const response = await fetch("/api/platform/v2/actions", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: await authenticatedJsonHeaders(),
    body: JSON.stringify(request),
  });
  const payload = (await response.json()) as
    | PlatformActionV2Response
    | { error?: string };
  if (!response.ok || !("accepted" in payload) || !payload.accepted) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "platform_v2_action_failed",
    );
  }
  return payload;
}

async function authenticatedJsonHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return headers;
}
