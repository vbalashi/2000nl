import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
import {
  forwardAbortSignal,
  platformFetchWithTimeout,
} from "./platformFetchWithTimeout";
import {
  clearPlatformV2TrainingMediaCache,
  preloadPlatformV2Audio,
  requestPlatformV2Translation,
} from "./platformV2TrainingMediaClient";
import {
  registerTrainingEntryTransition,
  recordTrainingTransitionTiming,
  recordTrainingTransitionResponse,
} from "../training/trainingTransitionTiming";
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
  requestPlatformV2Translation,
  resolvePlatformV2Audio,
  clearPlatformV2TrainingMediaCache,
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
  transitionId?: string;
  signal?: AbortSignal;
};

export type PlatformV2TrainingPrefetchInput =
  PlatformV2TrainingLookupInput & {
    // This partitions browser memory only; server authentication remains authoritative.
    cacheOwnerId: string;
  };

export type PlatformV2TrainingPreparationInput =
  PlatformV2TrainingPrefetchInput & {
    transitionId: string;
    generateMissingTranslation?: boolean;
  };

export type PlatformV2TrainingPreparationResult =
  | (PlatformV2TrainingEntryResult & {
      translation: "cached" | "generated" | "not-requested" | "failed";
      audio: "ready" | "unavailable" | "failed";
    })
  | Exclude<PlatformV2TrainingLookupResult, PlatformV2TrainingEntryResult>;

type PrefetchedLookup = {
  cacheOwnerId: string;
  promise: Promise<PlatformV2TrainingLookupResult>;
  result: PlatformV2TrainingLookupResult | null;
  expiresAt: number;
  controller: AbortController;
  consumed: boolean;
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
  const startedAt = performance.now();
  const response = await platformFetchWithTimeout("/api/platform/v2/lookup", {
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
  if (input.transitionId) {
    recordTrainingTransitionResponse(
      input.transitionId,
      "next-card.lookup",
      startedAt,
      response,
      response.ok ? "ready" : `http-${response.status}`,
    );
  }
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
  input: PlatformV2TrainingPrefetchInput,
): Promise<PlatformV2TrainingLookupResult> {
  const key = trainingLookupKey(input);
  const existing = validPrefetch(key);
  if (existing) return existing.promise;

  const record: PrefetchedLookup = {
    cacheOwnerId: input.cacheOwnerId,
    promise: Promise.resolve({ state: "entry-not-found" }),
    result: null,
    expiresAt: Date.now() + PREFETCH_TTL_MS,
    controller: new AbortController(),
    consumed: false,
  };
  const detachInputSignal = forwardAbortSignal(input.signal, record.controller);
  record.promise = fetchPlatformV2TrainingEntry({
    ...input,
    signal: record.controller.signal,
  }).then(
    (result) => {
      detachInputSignal();
      if (result.state === "ready") {
        record.result = result;
        if (record.consumed && prefetchedLookups.get(key) === record) {
          prefetchedLookups.delete(key);
        }
      } else if (prefetchedLookups.get(key) === record) {
        prefetchedLookups.delete(key);
      }
      return result;
    },
    (error) => {
      detachInputSignal();
      if (prefetchedLookups.get(key) === record) {
        prefetchedLookups.delete(key);
      }
      throw error;
    },
  );
  prefetchedLookups.set(key, record);
  trimPrefetchedLookups();
  return record.promise;
}

export async function preparePlatformV2TrainingEntry(
  input: PlatformV2TrainingPreparationInput,
): Promise<PlatformV2TrainingPreparationResult> {
  const startedAt = performance.now();
  const initialLookup = await prefetchPlatformV2TrainingEntry(input);
  if (initialLookup.state !== "ready") return initialLookup;
  registerTrainingEntryTransition(
    initialLookup.entry.entryId,
    input.transitionId,
    startedAt,
  );
  let lookup = initialLookup;
  let translation: "cached" | "generated" | "not-requested" | "failed" =
    lookup.entry.translation?.status === "ready"
      ? "cached"
      : "not-requested";
  if (input.generateMissingTranslation && translation !== "cached") {
    const capability = lookup.entry.capabilities.find(
      (candidate) =>
        candidate.actionId === "request-translation" &&
        candidate.target.entryId === input.entryId &&
        candidate.targetLanguageCode === input.translationTargetLanguageCode,
    );
    if (capability?.actionId === "request-translation") {
      try {
        await requestPlatformV2Translation(capability, {
          transitionId: input.transitionId,
          signal: input.signal,
        });
        prefetchedLookups.delete(trainingLookupKey(input));
        const refreshed = await prefetchPlatformV2TrainingEntry(input);
        if (refreshed.state === "ready") {
          lookup = refreshed;
          translation =
            refreshed.entry.translation?.status === "ready"
              ? "generated"
              : "failed";
        } else {
          translation = "failed";
        }
      } catch {
        translation = "failed";
      }
    }
  }

  let audio: "ready" | "unavailable" | "failed" = "unavailable";
  if (lookup.group.header.audio) {
    try {
      await preloadPlatformV2Audio({
        cacheOwnerId: input.cacheOwnerId,
        capability: lookup.group.header.audio,
        text: lookup.group.header.text,
        transitionId: input.transitionId,
        signal: input.signal,
      });
      audio = "ready";
    } catch {
      audio = "failed";
    }
  }

  const result: PlatformV2TrainingPreparationResult = {
    ...lookup,
    translation,
    audio,
  };
  recordTrainingTransitionTiming({
    transitionId: input.transitionId,
    stage: "preparation.total",
    durationMs: performance.now() - startedAt,
    outcome: `${result.translation}:${result.audio}`,
  });
  return result;
}

export function peekPrefetchedPlatformV2TrainingEntry(
  input: PlatformV2TrainingPrefetchInput,
): PlatformV2TrainingLookupResult | null {
  return validPrefetch(trainingLookupKey(input))?.result ?? null;
}

export function consumePrefetchedPlatformV2TrainingEntry(
  input: PlatformV2TrainingPrefetchInput,
): Promise<PlatformV2TrainingLookupResult> | null {
  const key = trainingLookupKey(input);
  const record = validPrefetch(key);
  if (!record) return null;
  record.consumed = true;
  if (record.result && prefetchedLookups.get(key) === record) {
    prefetchedLookups.delete(key);
  }
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
  const headers = await platformV2AuthenticatedJsonHeaders();
  let response: Response;
  try {
    response = await submitPlatformV2TrainingAction(request, headers, 1);
  } catch (error) {
    if (capability.actionId !== "review-card" || !isAmbiguousTransportError(error)) {
      throw error;
    }
    response = await submitPlatformV2TrainingAction(request, headers, 2);
  }
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

function submitPlatformV2TrainingAction(
  request: PlatformActionV2Request,
  headers: HeadersInit,
  attempt: 1 | 2,
) {
  const correlatedHeaders = Object.fromEntries(new Headers(headers).entries());
  return platformFetchWithTimeout("/api/platform/v2/actions", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...correlatedHeaders,
      "x-platform-action-attempt": String(attempt),
    },
    body: JSON.stringify(request),
  });
}

function isAmbiguousTransportError(error: unknown) {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message === "Failed to fetch" || message === "platform_request_timeout";
}

export function clearPlatformV2TrainingClientCaches(cacheOwnerId?: string) {
  for (const [key, record] of prefetchedLookups) {
    if (cacheOwnerId && record.cacheOwnerId !== cacheOwnerId) continue;
    record.controller.abort();
    prefetchedLookups.delete(key);
  }
  clearPlatformV2TrainingMediaCache(cacheOwnerId);
}

function trainingLookupKey(input: PlatformV2TrainingPrefetchInput) {
  return [
    input.cacheOwnerId,
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
    record.controller.abort();
    prefetchedLookups.delete(key);
    return null;
  }
  return record;
}

function trimPrefetchedLookups() {
  while (prefetchedLookups.size > MAX_PREFETCHED_LOOKUPS) {
    const oldestKey = prefetchedLookups.keys().next().value;
    if (typeof oldestKey !== "string") return;
    prefetchedLookups.get(oldestKey)?.controller.abort();
    prefetchedLookups.delete(oldestKey);
  }
}
