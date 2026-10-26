import type { CurrentTrainingCardContext } from "./trainingCurrentCardClient";
import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
import { observeDictionaryMeaningTranslation } from "@/lib/translation/dictionaryTranslationObservation";
import {
  forwardAbortSignal,
  platformFetchWithTimeout,
} from "./platformFetchWithTimeout";
import {
  recordTrainingTransitionResponse,
  recordTrainingTransitionTiming,
} from "../training/trainingTransitionTiming";
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
  entryId?: string;
  sourceVersion?: number;
  node?: {contentNodeId:string;sourceTextFingerprint:string};
  currentCard?: CurrentTrainingCardContext;
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
  context: { transitionId?: string; signal?: AbortSignal; background?: boolean; force?: boolean; currentCard?: CurrentTrainingCardContext } = {},
): Promise<"ready" | "pending" | "failed"> {
  return requestPlatformV2TranslationUncached(capability, context);
}

async function requestPlatformV2TranslationUncached(
  capability: Extract<
    PlatformSenseCardCapabilityV2,
    { actionId: "request-translation" }
  >,
  context: { transitionId?: string; signal?: AbortSignal; background?: boolean; force?: boolean; currentCard?: CurrentTrainingCardContext },
): Promise<"ready" | "pending" | "failed"> {
  const startedAt = performance.now();
  const response = await observeDictionaryMeaningTranslation({
    entryId: capability.target.entryId,
    ...(context.currentCard ? {currentCard:context.currentCard} : {}),
    targetLanguageCode: capability.targetLanguageCode,
    signal: context.signal,
    background: context.background,
    force: context.force,
  });
  if (context.transitionId) {
    const cacheOutcome = response.headers.get("x-platform-cache");
    const stage =
      cacheOutcome === "hit" || cacheOutcome === "pending"
        ? "translation.cache"
        : cacheOutcome === "provider"
          ? "translation.provider"
          : "translation.unknown";
    recordTrainingTransitionResponse(
      context.transitionId,
      stage,
      startedAt,
      response,
      response.ok
        ? (response.headers.get("x-platform-cache") ?? "ready")
        : `http-${response.status}`,
    );
  }
  if (response.status === 504 || response.status === 524) return "pending";
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? "translation_failed");
  }
  const payload = await response.json().catch(() => null) as { status?: string } | null;
  return payload?.status === "ready" || payload?.status === "pending" ? payload.status : "failed";
}

export async function resolvePlatformV2Audio(
  input: PlatformV2AudioRequest,
): Promise<string> {
  if(input.entryId)return resolveEntryAudio(input,false);
  const key = platformAudioKey(input);
  const prefetched = validPreload(preloadedAudio, key);
  if (prefetched) {
    preloadedAudio.delete(key);
    if (input.transitionId) {
      recordTrainingTransitionTiming({
        transitionId: input.transitionId,
        stage: "audio.cache",
        durationMs: 0,
        outcome: "client-preload-hit",
      });
    }
    return prefetched.promise;
  }
  return resolvePlatformV2AudioUncached(input);
}

export async function preloadPlatformV2Audio(
  input: PlatformV2AudioRequest,
): Promise<string> {
  if(input.entryId)return prepareEntryAudio(input);
  const key = platformAudioKey(input);
  const existing = validPreload(preloadedAudio, key);
  if (existing) {
    if (input.transitionId) {
      recordTrainingTransitionTiming({
        transitionId: input.transitionId,
        stage: "audio.cache",
        durationMs: 0,
        outcome: "client-preload-hit",
      });
    }
    return existing.promise;
  }
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
    const cacheOutcome = response.headers.get("x-platform-cache");
    recordTrainingTransitionResponse(
      input.transitionId,
      cacheOutcome === "hit" ? "audio.cache" : "audio.provider",
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

const entryAudioPreparations=new Map<string,PreloadedPromise<string>>();
function prepareEntryAudio(input:PlatformV2AudioRequest):Promise<string>{
  const key=JSON.stringify([platformAudioKey(input),input.entryId,input.sourceVersion??null,input.node??null,input.currentCard??null]);
  const existing=validPreload(entryAudioPreparations,key);
  if(existing)return existing.promise;
  const controller=new AbortController();
  const detach=forwardAbortSignal(input.signal,controller);
  const record:PreloadedPromise<string>={cacheOwnerId:input.cacheOwnerId,expiresAt:Date.now()+PRELOAD_TTL_MS,controller,promise:Promise.resolve("")};
  record.promise=resolveEntryAudio({...input,signal:controller.signal},true)
    .catch(error=>{if(entryAudioPreparations.get(key)===record)entryAudioPreparations.delete(key);throw error;})
    .finally(detach);
  entryAudioPreparations.set(key,record);trimPreloaded(entryAudioPreparations);
  return record.promise;
}

const entryAudioUrls=new Map<string,{owner:string;expiresAt:number}>();
const entryAudioRequests=new Map<AbortController,string>();
async function resolveEntryAudio(input:PlatformV2AudioRequest,prepareOnly:boolean):Promise<string> {
  const startedAt=performance.now();
  const controller=new AbortController();
  entryAudioRequests.set(controller,input.cacheOwnerId);
  const detach=forwardAbortSignal(input.signal,controller);
  try{
  const response=await platformFetchWithTimeout("/api/platform/v2/audio",{
    method:"POST",credentials:"same-origin",cache:"no-store",signal:controller.signal,
    headers:await platformV2AuthenticatedJsonHeaders(input.cacheOwnerId),
    body:JSON.stringify({entryId:input.entryId,...(input.sourceVersion!==undefined?{sourceVersion:input.sourceVersion}:{}),...(input.node?{node:input.node}:{}),...(input.currentCard?{currentCard:input.currentCard}:{}),prepareOnly}),
  });
  if(input.transitionId)recordTrainingTransitionResponse(input.transitionId,
    response.headers.get("x-platform-cache")==="hit"?"audio.cache":"audio.provider",startedAt,response,
    response.ok?response.headers.get("x-platform-cache")??"ready":`http-${response.status}`);
  if(!response.ok)throw new Error("entry_audio_not_available");
  await platformV2AuthenticatedJsonHeaders(input.cacheOwnerId);
  if(controller.signal.aborted)throw new DOMException("Aborted","AbortError");
  if(prepareOnly)return "";
  if(response.headers.get("content-type")?.split(";")[0]!=="audio/mpeg")throw new Error("invalid_entry_audio_response");
  const blob=await response.blob();
  await platformV2AuthenticatedJsonHeaders(input.cacheOwnerId);
  if(controller.signal.aborted)throw new DOMException("Aborted","AbortError");
  for(const [url,record]of entryAudioUrls)if(record.expiresAt<=Date.now()){
    URL.revokeObjectURL(url);entryAudioUrls.delete(url);
  }
  const url=URL.createObjectURL(blob);
  entryAudioUrls.set(url,{owner:input.cacheOwnerId,expiresAt:Date.now()+PRELOAD_TTL_MS});
  while(entryAudioUrls.size>MAX_PRELOADED_ASSETS){
    const oldest=entryAudioUrls.keys().next().value;
    if(!oldest)break;
    URL.revokeObjectURL(oldest);entryAudioUrls.delete(oldest);
  }
  return url;
  }finally{detach();entryAudioRequests.delete(controller);}
}

export function clearPlatformV2TrainingMediaCache(cacheOwnerId?: string) {
  for(const [key,record]of entryAudioPreparations){
    if(cacheOwnerId&&record.cacheOwnerId!==cacheOwnerId)continue;
    record.controller.abort();entryAudioPreparations.delete(key);
  }
  for(const [controller,owner]of entryAudioRequests){
    if(cacheOwnerId&&owner!==cacheOwnerId)continue;
    controller.abort();entryAudioRequests.delete(controller);
  }
  for(const [url,record]of entryAudioUrls){
    if(cacheOwnerId&&record.owner!==cacheOwnerId)continue;
    URL.revokeObjectURL(url);entryAudioUrls.delete(url);
  }
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
