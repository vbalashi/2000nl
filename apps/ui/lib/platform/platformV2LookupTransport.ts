import type {
  PlatformLookupV2Request,
  PlatformLookupV2Response,
} from "../../../../packages/shared/types/platformV2";
import { platformFetchWithTimeout } from "./platformFetchWithTimeout";
import { forwardAbortSignal } from "./platformFetchWithTimeout";
import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";

export type PlatformV2LookupTransportResult =
  | {
      state: "ready";
      payload: PlatformLookupV2Response;
      response: Response;
    }
  | { state: "http-error"; status: number; response: Response }
  | { state: "contract-mismatch"; response: Response };

export async function requestPlatformV2Lookup(input: {
  body: PlatformLookupV2Request;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<PlatformV2LookupTransportResult> {
  const controller = new AbortController();
  const detach = forwardAbortSignal(input.signal, controller);
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs ?? 12_000);
  try {
    const headers = await raceWithAbort(
      platformV2AuthenticatedJsonHeaders(),
      controller.signal,
    );
    if (controller.signal.aborted) {
      if (timedOut) throw new Error("platform_request_timeout");
      throw new DOMException("Aborted", "AbortError");
    }
    const response = await platformFetchWithTimeout(
      "/api/platform/v2/lookup",
      {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers,
      body: JSON.stringify(input.body),
      },
      input.timeoutMs,
    );
    if (!response.ok) {
      return { state: "http-error", status: response.status, response };
    }

    const payload = await response.json().catch(() => null);
    if (!isPlatformLookupV2Response(payload)) {
      return { state: "contract-mismatch", response };
    }
    return { state: "ready", payload, response };
  } catch (error) {
    if (timedOut) throw new Error("platform_request_timeout");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    detach();
  }
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function isPlatformLookupV2Response(
  value: unknown,
): value is PlatformLookupV2Response {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlatformLookupV2Response>;
  return (
    candidate.contractVersion === "platform-lookup-v2" &&
    typeof candidate.query === "string" &&
    isLookupRequest(candidate.request) &&
    Array.isArray(candidate.groups) &&
    candidate.groups.every(isHeadwordGroup) &&
    Boolean(
      candidate.page &&
        typeof candidate.page === "object" &&
        typeof candidate.page.selectedTierComplete === "boolean" &&
        (candidate.page.nextGroupCursor === null ||
          typeof candidate.page.nextGroupCursor === "string"),
    )
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown) => value === null || isString(value);
const isOptionalString = (value: unknown) => value === undefined || isString(value);
const isOptionalNumber = (value: unknown) =>
  value === undefined || (typeof value === "number" && Number.isFinite(value));
const isStringArray = (value: unknown) =>
  Array.isArray(value) && value.every(isString);

function isLookupRequest(value: unknown) {
  return isRecord(value) &&
    isNullableString(value.contentLanguageCode) &&
    isNullableString(value.translationTargetLanguageCode) &&
    isString(value.cardTypeId) && isString(value.intent);
}

function isSemanticTerm(value: unknown) {
  return isRecord(value) && isString(value.termId) && isString(value.messageKey) &&
    isOptionalString(value.sourceValue);
}

function isTranslation(value: unknown, entryId?: string) {
  return isRecord(value) && isString(value.translationId) &&
    (entryId === undefined || value.entryId === entryId) &&
    isString(value.targetLanguageCode) && isString(value.status) &&
    isOptionalString(value.text) &&
    (value.alternativeTexts === undefined || isStringArray(value.alternativeTexts)) &&
    (value.baseText === undefined || isNullableString(value.baseText)) &&
    (value.note === undefined || isNullableString(value.note)) &&
    isString(entryId === undefined
      ? value.sourceTextFingerprint
      : value.sourceContentFingerprint) &&
    isString(value.translationPolicyVersion) &&
    isOptionalString(value.providerRevision) && isOptionalString(value.errorCode) &&
    (entryId === undefined || typeof value.isFresh === "boolean");
}

function isCapabilityTarget(value: unknown) {
  if (!isRecord(value) || !isString(value.kind) || !isString(value.entryId)) {
    return false;
  }
  if (value.kind === "sense-card") {
    return isString(value.cardTypeId) && isString(value.stateRevision) &&
      isOptionalString(value.activeKnownMarkId) &&
      isOptionalString(value.knownMarkRevision);
  }
  if (value.kind === "entry") return isString(value.contentRevision);
  if (value.kind === "content-node") {
    return isString(value.contentNodeId) && isString(value.sourceTextFingerprint);
  }
  return value.kind === "translation" && isString(value.translationId) &&
    isOptionalString(value.contentNodeId) && isString(value.sourceTextFingerprint);
}

function isCapability(value: unknown) {
  return isRecord(value) && isString(value.actionId) && isString(value.elementId) &&
    isString(value.messageKey) && isCapabilityTarget(value.target) &&
    (value.reviewResult === undefined || isString(value.reviewResult)) &&
    (value.targetLanguageCode === undefined || isString(value.targetLanguageCode));
}

function isContentNode(value: unknown) {
  return isRecord(value) && isString(value.contentNodeId) &&
    isNullableString(value.parentContentNodeId) && isString(value.kind) &&
    typeof value.order === "number" && Number.isFinite(value.order) &&
    isString(value.text) &&
    isString(value.sourceTextFingerprint) && Array.isArray(value.translations) &&
    value.translations.every((translation) => isTranslation(translation));
}

function isCard(value: unknown) {
  return isRecord(value) && isString(value.cardTypeId) &&
    isRecord(value.scheduler) && isString(value.scheduler.phase) &&
    isOptionalNumber(value.scheduler.repeatCount) &&
    (value.scheduler.lastSeenAt === undefined ||
      isNullableString(value.scheduler.lastSeenAt)) &&
    (value.scheduler.frozenUntil === undefined ||
      isNullableString(value.scheduler.frozenUntil)) &&
    (value.knownMark === null ||
      (isRecord(value.knownMark) && isString(value.knownMark.markId) &&
        isString(value.knownMark.revision) && isString(value.knownMark.markedAt))) &&
    isString(value.stateRevision);
}

function isCrossReferenceCapability(value: unknown) {
  return isRecord(value) && value.actionId === "follow-cross-reference" &&
    isString(value.elementId) && isString(value.messageKey);
}

function isEntry(value: unknown) {
  if (!isRecord(value) || !isString(value.kind)) return false;
  if (value.kind === "cross-reference") {
    return isString(value.crossReferenceId) &&
      (value.meaningOrdinal === null || typeof value.meaningOrdinal === "number") &&
      (value.label === null || isSemanticTerm(value.label)) && isString(value.text) &&
      isRecord(value.target) && isString(value.target.query) &&
      isOptionalString(value.target.headwordGroupId) &&
      isOptionalString(value.target.entryId) && Array.isArray(value.capabilities) &&
      value.capabilities.every(isCrossReferenceCapability);
  }
  return value.kind === "sense-card" && isString(value.entryId) &&
    (value.meaningOrdinal === null || typeof value.meaningOrdinal === "number") &&
    (value.partOfSpeech === undefined || isSemanticTerm(value.partOfSpeech)) &&
    (value.card === null || isCard(value.card)) && isString(value.contentRevision) &&
    isNullableString(value.summaryContentNodeId) && Array.isArray(value.contentNodes) &&
    value.contentNodes.every(isContentNode) && Array.isArray(value.capabilities) &&
    value.capabilities.every(isCapability) &&
    (value.translation === null || isTranslation(value.translation, value.entryId));
}

function isHeadwordGroup(value: unknown) {
  return isRecord(value) && isString(value.headwordGroupId) &&
    isRecord(value.dictionary) && isString(value.dictionary.dictionaryId) &&
    isString(value.dictionary.sourceLanguageCode) &&
    isString(value.dictionary.displayName) && isString(value.dictionary.messageKey) &&
    isRecord(value.header) && isString(value.header.text) &&
    isOptionalNumber(value.header.homographNumber) &&
    isOptionalString(value.header.displayPronunciation) &&
    isOptionalString(value.header.pronunciation) &&
    isOptionalString(value.header.article) &&
    (value.header.partOfSpeech === undefined || isSemanticTerm(value.header.partOfSpeech)) &&
    (value.header.audio === undefined ||
      (isRecord(value.header.audio) && isString(value.header.audio.audioId) &&
        value.header.audio.actionId === "play-audio" &&
        isString(value.header.audio.contentLanguageCode))) &&
    typeof value.senseCount === "number" && Number.isInteger(value.senseCount) &&
    typeof value.entryCount === "number" && Number.isInteger(value.entryCount) &&
    Array.isArray(value.indicators) && value.indicators.every((indicator) =>
      isRecord(indicator) && isString(indicator.indicatorId) &&
      isString(indicator.value) && isString(indicator.messageKey)) &&
    Array.isArray(value.entries) &&
    value.entries.every(isEntry);
}
