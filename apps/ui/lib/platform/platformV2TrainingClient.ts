import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
import type { CardTypeId } from "../../../../packages/shared/types/platform";
import type {
  PlatformActionV2Request,
  PlatformActionV2Response,
  PlatformHeadwordGroupV2,
  PlatformLookupV2Response,
  PlatformSenseCardCapabilityV2,
  PlatformSenseCardEntryV2,
} from "../../../../packages/shared/types/platformV2";

export {
  preloadPlatformV2Audio,
  preloadPlatformV2Translation,
  requestPlatformV2Translation,
  resolvePlatformV2Audio,
} from "./platformV2TrainingMediaClient";

export type PlatformV2TrainingEntryResult = {
  state: "ready";
  group: PlatformHeadwordGroupV2;
  entry: PlatformSenseCardEntryV2;
};

type PlatformV2TrainingEntrySelection = Omit<
  PlatformV2TrainingEntryResult,
  "state"
>;

export type PlatformV2TrainingLookupResult =
  | PlatformV2TrainingEntryResult
  | { state: "lookup-http-error"; status: number }
  | { state: "contract-mismatch" }
  | { state: "entry-not-found" };

export type PlatformV2TrainingLookupInput = {
  entryId: string;
  cardTypeId: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  signal?: AbortSignal;
};

type PrefetchedLookup = {
  promise: Promise<PlatformV2TrainingLookupResult>;
  result: PlatformV2TrainingLookupResult | null;
  expiresAt: number;
};

const PREFETCH_TTL_MS = 30_000;
const MAX_PREFETCHED_LOOKUPS = 24;
const prefetchedLookups = new Map<string, PrefetchedLookup>();

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

export async function fetchPlatformV2TrainingEntry(
  input: PlatformV2TrainingLookupInput,
): Promise<PlatformV2TrainingLookupResult> {
  const response = await fetch("/api/platform/v2/lookup", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal: input.signal,
    headers: await platformV2AuthenticatedJsonHeaders(),
    body: JSON.stringify({
      entryId: input.entryId,
      cardTypeId: input.cardTypeId,
      contentLanguageCode: input.contentLanguageCode,
      translationTargetLanguageCode: input.translationTargetLanguageCode,
      intent: "training-review",
    }),
  });
  if (!response.ok) {
    return { state: "lookup-http-error", status: response.status };
  }

  const payload = (await response.json()) as Partial<PlatformLookupV2Response>;
  if (
    payload.contractVersion !== "platform-lookup-v2" ||
    !Array.isArray(payload.groups)
  ) {
    return { state: "contract-mismatch" };
  }

  const selected = selectPlatformV2TrainingEntry(
    payload as PlatformLookupV2Response,
    input.entryId,
  );
  return selected
    ? { state: "ready", ...selected }
    : { state: "entry-not-found" };
}

export function prefetchPlatformV2TrainingEntry(
  input: PlatformV2TrainingLookupInput,
): Promise<PlatformV2TrainingLookupResult> {
  const key = trainingLookupKey(input);
  const existing = validPrefetch(key);
  if (existing) return existing.promise;

  const record: PrefetchedLookup = {
    promise: Promise.resolve({ state: "entry-not-found" }),
    result: null,
    expiresAt: Date.now() + PREFETCH_TTL_MS,
  };
  record.promise = fetchPlatformV2TrainingEntry(input).then(
    (result) => {
      if (result.state === "ready") {
        record.result = result;
      } else {
        prefetchedLookups.delete(key);
      }
      return result;
    },
    (error) => {
      prefetchedLookups.delete(key);
      throw error;
    },
  );
  prefetchedLookups.set(key, record);
  trimPrefetchedLookups();
  return record.promise;
}

export function peekPrefetchedPlatformV2TrainingEntry(
  input: PlatformV2TrainingLookupInput,
): PlatformV2TrainingLookupResult | null {
  return validPrefetch(trainingLookupKey(input))?.result ?? null;
}

export function consumePrefetchedPlatformV2TrainingEntry(
  input: PlatformV2TrainingLookupInput,
): Promise<PlatformV2TrainingLookupResult> | null {
  const key = trainingLookupKey(input);
  const record = validPrefetch(key);
  if (!record) return null;
  prefetchedLookups.delete(key);
  return record.promise;
}

export function selectPlatformV2TrainingEntry(
  payload: PlatformLookupV2Response,
  entryId: string,
): PlatformV2TrainingEntrySelection | null {
  for (const group of payload.groups) {
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
    headers: await platformV2AuthenticatedJsonHeaders(),
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

function trainingLookupKey(input: PlatformV2TrainingLookupInput) {
  return [
    input.entryId,
    input.cardTypeId,
    input.contentLanguageCode,
    input.translationTargetLanguageCode ?? "off",
  ].join(":");
}

function validPrefetch(key: string) {
  const record = prefetchedLookups.get(key);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    prefetchedLookups.delete(key);
    return null;
  }
  return record;
}

function trimPrefetchedLookups() {
  while (prefetchedLookups.size > MAX_PREFETCHED_LOOKUPS) {
    const oldestKey = prefetchedLookups.keys().next().value;
    if (typeof oldestKey !== "string") return;
    prefetchedLookups.delete(oldestKey);
  }
}
