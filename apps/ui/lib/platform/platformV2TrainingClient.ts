import {
  forwardAbortSignal,
} from "./platformFetchWithTimeout";
import { requestPlatformV2Lookup } from "./platformV2LookupTransport";
import {
  clearPlatformV2TrainingMediaCache,
} from "./platformV2TrainingMediaClient";
import {
  recordTrainingTransitionTiming,
  recordTrainingTransitionResponse,
} from "../training/trainingTransitionTiming";
import type { CardTypeId } from "../../../../packages/shared/types/platform";
import type {
  PlatformHeadwordGroupV2,
  PlatformLookupV2Response,
  PlatformSenseCardEntryV2,
} from "../../../../packages/shared/types/platformV2";

export {
  preloadPlatformV2Audio,
  requestPlatformV2Translation,
  resolvePlatformV2Audio,
  clearPlatformV2TrainingMediaCache,
} from "./platformV2TrainingMediaClient";

export {
  buildPlatformV2TrainingActionRequest,
  isPlatformV2TrainingActionCapability,
  performPlatformV2TrainingAction,
} from "./platformV2TrainingActionClient";
export type { PlatformV2TrainingActionCapability } from "./platformV2TrainingActionClient";

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
    bypassCache?: boolean;
  };

type PrefetchedLookup = {
  cacheOwnerId: string;
  promise: Promise<PlatformV2TrainingLookupResult>;
  result: PlatformV2TrainingLookupResult | null;
  expiresAt: number;
  controller: AbortController;
  consumed: boolean;
  transitionId?: string;
  terminalOutcomeRecorded: boolean;
};

const PREFETCH_TTL_MS = 30_000;
const MAX_PREFETCHED_LOOKUPS = 24;
const prefetchedLookups = new Map<string, PrefetchedLookup>();

export async function fetchPlatformV2TrainingEntry(
  input: PlatformV2TrainingLookupInput,
): Promise<PlatformV2TrainingLookupResult> {
  const startedAt = performance.now();
  const result = await requestPlatformV2Lookup({
    signal: input.signal,
    body: {
      entryId: input.entryId,
      cardTypeId: input.cardTypeId,
      contentLanguageCode: input.contentLanguageCode,
      translationTargetLanguageCode: input.translationTargetLanguageCode,
      intent: "training-review",
    },
  });
  if (input.transitionId) {
    recordTrainingTransitionResponse(
      input.transitionId,
      "next-card.lookup",
      startedAt,
      result.response,
      result.state === "ready"
        ? "ready"
        : result.state === "http-error"
          ? `http-${result.status}`
          : "contract-mismatch",
    );
  }
  if (result.state === "http-error") {
    return { state: "lookup-http-error", status: result.status };
  }
  if (result.state === "contract-mismatch") {
    return { state: "contract-mismatch" };
  }

  const selected = selectPlatformV2TrainingEntry(
    result.payload,
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
  const existing = input.bypassCache ? null : validPrefetch(key);
  if (existing) {
    recordPrefetchOutcome(
      input.transitionId ?? existing.transitionId,
      existing.result ? "reuse-ready" : "reuse-pending",
    );
    return existing.promise;
  }
  if (input.bypassCache) prefetchedLookups.delete(key);

  recordPrefetchOutcome(input.transitionId, "miss");

  const record: PrefetchedLookup = {
    cacheOwnerId: input.cacheOwnerId,
    promise: Promise.resolve({ state: "entry-not-found" }),
    result: null,
    expiresAt: Date.now() + PREFETCH_TTL_MS,
    controller: new AbortController(),
    consumed: false,
    transitionId: input.transitionId,
    terminalOutcomeRecorded: false,
  };
  record.controller.signal.addEventListener(
    "abort",
    () => recordTerminalPrefetchOutcome(record, "cancelled"),
    { once: true },
  );
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
  if (!record) {
    recordPrefetchOutcome(input.transitionId, "accepted-miss");
    return null;
  }
  recordPrefetchOutcome(
    input.transitionId ?? record.transitionId,
    record.result ? "accepted-hit-ready" : "accepted-hit-pending",
  );
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

export function clearPlatformV2TrainingClientCaches(cacheOwnerId?: string) {
  for (const [key, record] of prefetchedLookups) {
    if (cacheOwnerId && record.cacheOwnerId !== cacheOwnerId) continue;
    recordTerminalPrefetchOutcome(record, "cancelled");
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
    recordTerminalPrefetchOutcome(record, "expired");
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
    const record = prefetchedLookups.get(oldestKey);
    if (record) recordTerminalPrefetchOutcome(record, "evicted");
    record?.controller.abort();
    prefetchedLookups.delete(oldestKey);
  }
}

function recordTerminalPrefetchOutcome(
  record: PrefetchedLookup,
  outcome: "cancelled" | "expired" | "evicted",
) {
  if (record.terminalOutcomeRecorded) return;
  record.terminalOutcomeRecorded = true;
  recordPrefetchOutcome(record.transitionId, outcome);
}

function recordPrefetchOutcome(transitionId: string | undefined, outcome: string) {
  if (!transitionId) return;
  recordTrainingTransitionTiming({
    transitionId,
    stage: "next-card.prefetch",
    durationMs: 0,
    outcome,
  });
}
