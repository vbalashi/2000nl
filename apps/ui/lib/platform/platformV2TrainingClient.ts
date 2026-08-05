import { supabase } from "@/lib/supabaseClient";
import type { CardTypeId } from "../../../../packages/shared/types/platform";
import type {
  PlatformActionV2Request,
  PlatformActionV2Response,
  PlatformAudioCapabilityV2,
  PlatformHeadwordGroupV2,
  PlatformLookupV2Response,
  PlatformSenseCardCapabilityV2,
  PlatformSenseCardEntryV2,
} from "../../../../packages/shared/types/platformV2";

export type PlatformV2SingleSenseResult = {
  group: PlatformHeadwordGroupV2;
  entry: PlatformSenseCardEntryV2;
};

export type PlatformV2TrainingActionCapability =
  PlatformSenseCardCapabilityV2 & {
    actionId:
      | "start-learning"
      | "mark-known"
      | "undo-known"
      | "review-card";
  };

export function isPlatformV2TrainingActionCapability(
  capability: PlatformSenseCardCapabilityV2,
): capability is PlatformV2TrainingActionCapability {
  return (
    capability.actionId === "start-learning" ||
    capability.actionId === "mark-known" ||
    capability.actionId === "undo-known" ||
    capability.actionId === "review-card"
  );
}

export function buildPlatformV2TrainingActionRequest(
  capability: PlatformV2TrainingActionCapability,
  clientEventId: string,
): PlatformActionV2Request {
  if (capability.actionId === "review-card") {
    return {
      actionId: capability.actionId,
      clientEventId,
      target: capability.target,
      reviewResult: capability.reviewResult,
    };
  }
  if (capability.actionId === "undo-known") {
    return {
      actionId: capability.actionId,
      clientEventId,
      target: capability.target,
    };
  }
  return {
    actionId: capability.actionId,
    clientEventId,
    target: capability.target,
  };
}

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
      intent: "training-review",
    }),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as PlatformLookupV2Response;
  if (payload.contractVersion !== "platform-lookup-v2") return null;

  return selectPlatformV2SingleSense(payload, input.entryId);
}

export function selectPlatformV2SingleSense(
  payload: PlatformLookupV2Response,
  entryId: string,
): PlatformV2SingleSenseResult | null {
  for (const group of payload.groups) {
    if (group.senseCount !== 1) continue;
    const entry = group.entries.find(
      (candidate): candidate is PlatformSenseCardEntryV2 =>
        candidate.kind === "sense-card" && candidate.entryId === entryId,
    );
    if (entry) return { group, entry };
  }
  return null;
}

export async function performPlatformV2TrainingAction(
  capability: PlatformV2TrainingActionCapability,
): Promise<PlatformActionV2Response> {
  const request = buildPlatformV2TrainingActionRequest(
    capability,
    crypto.randomUUID(),
  );
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
  if (
    !response.ok ||
    !("contractVersion" in payload) ||
    payload.contractVersion !== "platform-action-v2" ||
    !payload.accepted
  ) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "platform_v2_action_failed",
    );
  }
  return payload;
}

export async function resolvePlatformV2Audio(input: {
  capability: PlatformAudioCapabilityV2;
  text: string;
}): Promise<string> {
  const response = await fetch("/api/platform/v1/audio/resolve", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: await authenticatedJsonHeaders(),
    body: JSON.stringify({
      text: input.text,
      languageCode: input.capability.contentLanguageCode,
      purpose: "dictionary-headword",
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { asset?: { url?: string }; error?: string | { code?: string } }
    | null;
  const url = payload?.asset?.url;
  if (!response.ok || !url) {
    const error = payload?.error;
    throw new Error(
      typeof error === "string"
        ? error
        : error?.code ?? "platform_v2_audio_failed",
    );
  }
  return url;
}

async function authenticatedJsonHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return headers;
}
