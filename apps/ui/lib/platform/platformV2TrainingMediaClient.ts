import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
import {
  forwardAbortSignal,
  platformFetchWithTimeout,
} from "./platformFetchWithTimeout";
import { recordTrainingTransitionResponse } from "../training/trainingTransitionTiming";
import type {
  PlatformAudioCapabilityV2,
  PlatformSenseCardCapabilityV2,
} from "../../../../packages/shared/types/platformV2";

type PreloadedPromise<T> = {
  cacheOwnerId: string;
  promise: Promise<T>;
  expiresAt: number;
  controller: AbortController;
};

type PlatformV2AudioRequest = {
  cacheOwnerId: string;
  capability: PlatformAudioCapabilityV2;
  text: string;
  transitionId?: string;
  signal?: AbortSignal;
};

const PRELOAD_TTL_MS = 2 * 60_000;
const MAX_PRELOADED_ASSETS = 24;
const preloadedAudio = new Map<string, PreloadedPromise<string>>();

export async function requestPlatformV2Translation(
  capability: Extract<
    PlatformSenseCardCapabilityV2,
    { actionId: "request-translation" }
  >,
  context: { transitionId?: string; signal?: AbortSignal } = {},
): Promise<void> {
  return requestPlatformV2TranslationUncached(capability, context);
}

async function requestPlatformV2TranslationUncached(
  capability: Extract<
    PlatformSenseCardCapabilityV2,
    { actionId: "request-translation" }
  >,
  context: { transitionId?: string; signal?: AbortSignal },
): Promise<void> {
  const startedAt = performance.now();
  const response = await platformFetchWithTimeout(
    "/api/platform/translation",
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: context.signal,
      headers: await platformV2AuthenticatedJsonHeaders(),
      body: JSON.stringify({
        entryId: capability.target.entryId,
        targetLang: capability.targetLanguageCode,
      }),
    },
  );
  if (context.transitionId) {
    recordTrainingTransitionResponse(
      context.transitionId,
      "translation.cache-or-provider",
      startedAt,
      response,
      response.ok
        ? (response.headers.get("x-platform-cache") ?? "ready")
        : `http-${response.status}`,
    );
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? "translation_failed");
  }
}

export async function resolvePlatformV2Audio(
  input: PlatformV2AudioRequest,
): Promise<string> {
  const key = platformAudioKey(input);
  const prefetched = validPreload(preloadedAudio, key);
  if (prefetched) {
    preloadedAudio.delete(key);
    return prefetched.promise;
  }
  return resolvePlatformV2AudioUncached(input);
}

export async function preloadPlatformV2Audio(
  input: PlatformV2AudioRequest,
): Promise<string> {
  const key = platformAudioKey(input);
  const existing = validPreload(preloadedAudio, key);
  if (existing) return existing.promise;
  const record: PreloadedPromise<string> = {
    cacheOwnerId: input.cacheOwnerId,
    promise: Promise.resolve(""),
    expiresAt: Date.now() + PRELOAD_TTL_MS,
    controller: new AbortController(),
  };
  const detachInputSignal = forwardAbortSignal(input.signal, record.controller);
  const request = resolvePlatformV2AudioUncached(input, record.controller.signal)
    .then((url) => {
      detachInputSignal();
      if (typeof Audio !== "undefined") {
        try {
          const audio = new Audio(url);
          audio.preload = "auto";
          audio.load();
        } catch {
          // Resolving the asset still warms the server/browser HTTP caches.
        }
      }
      return url;
    })
    .catch((error) => {
      detachInputSignal();
      if (preloadedAudio.get(key) === record) {
        preloadedAudio.delete(key);
      }
      throw error;
    });
  record.promise = request;
  preloadedAudio.set(key, record);
  trimPreloaded(preloadedAudio);
  return request;
}

async function resolvePlatformV2AudioUncached(
  input: PlatformV2AudioRequest,
  signal?: AbortSignal,
): Promise<string> {
  const startedAt = performance.now();
  const response = await platformFetchWithTimeout(
    "/api/platform/v1/audio/resolve",
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: await platformV2AuthenticatedJsonHeaders(),
      body: JSON.stringify({
        text: input.text,
        languageCode: input.capability.contentLanguageCode,
        purpose: "dictionary-headword",
      }),
    },
  );
  if (input.transitionId) {
    recordTrainingTransitionResponse(
      input.transitionId,
      "audio.cache-or-provider",
      startedAt,
      response,
      response.ok
        ? (response.headers.get("x-platform-cache") ?? "ready")
        : `http-${response.status}`,
    );
  }
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

export function clearPlatformV2TrainingMediaCache(cacheOwnerId?: string) {
  for (const [key, record] of preloadedAudio) {
    if (cacheOwnerId && record.cacheOwnerId !== cacheOwnerId) continue;
    record.controller.abort();
    preloadedAudio.delete(key);
  }
}

function validPreload<T>(map: Map<string, PreloadedPromise<T>>, key: string) {
  const record = map.get(key);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    record.controller.abort();
    map.delete(key);
    return null;
  }
  return record;
}

function trimPreloaded<T>(map: Map<string, PreloadedPromise<T>>) {
  while (map.size > MAX_PRELOADED_ASSETS) {
    const oldestKey = map.keys().next().value;
    if (typeof oldestKey !== "string") return;
    map.get(oldestKey)?.controller.abort();
    map.delete(oldestKey);
  }
}

function platformAudioKey(input: PlatformV2AudioRequest) {
  return [
    input.cacheOwnerId,
    input.capability.audioId,
    input.capability.contentLanguageCode,
    input.text,
  ].join(":");
}
