import {
  prefetchPlatformV2TrainingEntry,
  type PlatformV2TrainingEntryResult,
  type PlatformV2TrainingLookupResult,
  type PlatformV2TrainingPrefetchInput,
} from "./platformV2TrainingClient";
import {
  preloadPlatformV2Audio,
  requestPlatformV2Translation,
} from "./platformV2TrainingMediaClient";
import {
  registerTrainingEntryTransition,
  recordTrainingTransitionTiming,
} from "../training/trainingTransitionTiming";

export type PlatformV2TrainingPreparationInput =
  PlatformV2TrainingPrefetchInput & {
    transitionId: string;
    generateMissingTranslation?: boolean;
  };

export type PlatformV2TrainingPreparationResult =
  | (PlatformV2TrainingEntryResult & {
      translation: "cached" | "generated" | "not-requested" | "pending" | "failed";
      audio: "ready" | "unavailable" | "failed";
    })
  | Exclude<PlatformV2TrainingLookupResult, PlatformV2TrainingEntryResult>;

export async function preparePlatformV2TrainingEntry(
  input: PlatformV2TrainingPreparationInput,
): Promise<PlatformV2TrainingPreparationResult> {
  const startedAt = performance.now();
  const initialLookup = await prefetchPlatformV2TrainingEntry(input);
  if (initialLookup.state !== "ready") return initialLookup;
  registerTrainingEntryTransition(
    initialLookup.entry.entryId,
    input.transitionId,
  );
  let lookup = initialLookup;
  const needsPreparation = (entry: PlatformV2TrainingEntryResult["entry"]) => entry.capabilities.some(
    candidate => candidate.actionId === "request-translation" && candidate.targetLanguageCode === input.translationTargetLanguageCode,
  );
  let translation: "cached" | "generated" | "not-requested" | "pending" | "failed" =
    !needsPreparation(lookup.entry) && lookup.entry.translation?.status === "ready" && lookup.entry.translation.isFresh
      ? "cached"
      : "not-requested";
  if (translation === "cached") {
    recordTrainingTransitionTiming({
      transitionId: input.transitionId,
      stage: "translation.cache",
      durationMs: 0,
      outcome: "hit",
    });
  }
  if (input.generateMissingTranslation && translation !== "cached") {
    const capability = lookup.entry.capabilities.find(
      (candidate) =>
        candidate.actionId === "request-translation" &&
        candidate.target.entryId === input.entryId &&
        candidate.targetLanguageCode === input.translationTargetLanguageCode,
    );
    if (capability?.actionId === "request-translation") {
      try {
        const status = await requestPlatformV2Translation(capability, {
          transitionId: input.transitionId,
          signal: input.signal,
          background: true,
        });
        // Pending/failed jobs publish no new overlay. Retain the healthy DTO
        // and prepare audio independently instead of doing a speculative lookup.
        translation = status === "ready" ? "generated" : status;
        if (status === "ready") {
          const refreshed = await prefetchPlatformV2TrainingEntry({
            ...input,
            bypassCache: true,
          });
          if (refreshed.state === "ready") {
            lookup = refreshed;
            translation = !needsPreparation(refreshed.entry) ? "generated" : "failed";
          } else {
            translation = "failed";
          }
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
        entryId: lookup.entry.entryId,
        sourceVersion: lookup.entry.sourceVersion,
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
