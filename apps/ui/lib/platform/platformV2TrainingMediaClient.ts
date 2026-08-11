import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
import type {
  PlatformAudioCapabilityV2,
  PlatformSenseCardCapabilityV2,
} from "../../../../packages/shared/types/platformV2";

type PreloadedPromise<T> = {
  promise: Promise<T>;
  expiresAt: number;
};

const PRELOAD_TTL_MS = 2 * 60_000;
const MAX_PRELOADED_ASSETS = 24;
const preloadedAudio = new Map<string, PreloadedPromise<string>>();
const preloadedTranslations = new Map<string, PreloadedPromise<void>>();

export async function requestPlatformV2Translation(
  capability: Extract<
    PlatformSenseCardCapabilityV2,
    { actionId: "request-translation" }
  >,
): Promise<void> {
  const key = platformTranslationKey(capability);
  const prefetched = validPreload(preloadedTranslations, key);
  if (prefetched) {
    preloadedTranslations.delete(key);
    return prefetched.promise;
  }
  return requestPlatformV2TranslationUncached(capability);
}

export function preloadPlatformV2Translation(
  capability: Extract<
    PlatformSenseCardCapabilityV2,
    { actionId: "request-translation" }
  >,
): Promise<void> {
  const key = platformTranslationKey(capability);
  const existing = validPreload(preloadedTranslations, key);
  if (existing) return existing.promise;
  const request = requestPlatformV2TranslationUncached(capability).catch(
    (error) => {
      preloadedTranslations.delete(key);
      throw error;
    },
  );
  preloadedTranslations.set(key, {
    promise: request,
    expiresAt: Date.now() + PRELOAD_TTL_MS,
  });
  trimPreloaded(preloadedTranslations);
  return request;
}

async function requestPlatformV2TranslationUncached(
  capability: Extract<
    PlatformSenseCardCapabilityV2,
    { actionId: "request-translation" }
  >,
): Promise<void> {
  const response = await fetch("/api/platform/translation", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: await platformV2AuthenticatedJsonHeaders(),
    body: JSON.stringify({
      entryId: capability.target.entryId,
      targetLang: capability.targetLanguageCode,
    }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? "translation_failed");
  }
}

export async function resolvePlatformV2Audio(input: {
  capability: PlatformAudioCapabilityV2;
  text: string;
}): Promise<string> {
  const key = platformAudioKey(input);
  const prefetched = validPreload(preloadedAudio, key);
  if (prefetched) {
    preloadedAudio.delete(key);
    return prefetched.promise;
  }
  return resolvePlatformV2AudioUncached(input);
}

export async function preloadPlatformV2Audio(input: {
  capability: PlatformAudioCapabilityV2;
  text: string;
}): Promise<string> {
  const key = platformAudioKey(input);
  const existing = validPreload(preloadedAudio, key);
  if (existing) return existing.promise;
  const request = resolvePlatformV2AudioUncached(input)
    .then((url) => {
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
      preloadedAudio.delete(key);
      throw error;
    });
  preloadedAudio.set(key, {
    promise: request,
    expiresAt: Date.now() + PRELOAD_TTL_MS,
  });
  trimPreloaded(preloadedAudio);
  return request;
}

async function resolvePlatformV2AudioUncached(input: {
  capability: PlatformAudioCapabilityV2;
  text: string;
}): Promise<string> {
  const response = await fetch("/api/platform/v1/audio/resolve", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: await platformV2AuthenticatedJsonHeaders(),
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

function validPreload<T>(map: Map<string, PreloadedPromise<T>>, key: string) {
  const record = map.get(key);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }
  return record;
}

function trimPreloaded<T>(map: Map<string, PreloadedPromise<T>>) {
  while (map.size > MAX_PRELOADED_ASSETS) {
    const oldestKey = map.keys().next().value;
    if (typeof oldestKey !== "string") return;
    map.delete(oldestKey);
  }
}

function platformAudioKey(input: {
  capability: PlatformAudioCapabilityV2;
  text: string;
}) {
  return [
    input.capability.audioId,
    input.capability.contentLanguageCode,
    input.text,
  ].join(":");
}

function platformTranslationKey(
  capability: Extract<
    PlatformSenseCardCapabilityV2,
    { actionId: "request-translation" }
  >,
) {
  return [
    capability.target.entryId,
    capability.target.contentRevision,
    capability.targetLanguageCode,
  ].join(":");
}
