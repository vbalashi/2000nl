import crypto from "node:crypto";
import { getPlatformServiceSupabase } from "../platform/serverSupabase";
import { DICTIONARY_MEANING_TRANSLATION_LIMITS } from "../translation/dictionaryMeaningTranslationContract";
import { ProviderOperationTimeout, withProviderDeadline } from "./providerTransport";

export type ProviderWorkKind = "text" | "draft" | "tts-public" | "tts-entry";
export class ProviderWorkError extends Error {
  constructor(readonly code: string, readonly httpStatus: number, readonly retryAfterMs = 0) { super(code); }
}
function setting(name: string, fallback: number, maximum: number) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new ProviderWorkError("invalid_provider_safety_configuration", 503);
  return value;
}
export function providerInputLimits() {
  return {
    translationCharacters: setting("PROVIDER_TRANSLATION_MAX_CHARACTERS", DICTIONARY_MEANING_TRANSLATION_LIMITS.requestStringCharacters, 100_000),
    translationItems: setting("PROVIDER_TRANSLATION_MAX_ITEMS", DICTIONARY_MEANING_TRANSLATION_LIMITS.contentItems, 512),
    audioCharacters: setting("PROVIDER_AUDIO_MAX_CHARACTERS", 2000, 8000),
  };
}
export function assertProviderInput(kind: "translation" | "audio", texts: string[]) {
  const limits = providerInputLimits();
  const maximum = kind === "audio" ? limits.audioCharacters : limits.translationCharacters;
  // Count Unicode code points, with a separate bounded UTF-8 envelope.
  const characters = texts.reduce((sum, text) => sum + Array.from(text).length, 0);
  if (!texts.length || characters < 1 || characters > maximum || texts.length > (kind === "audio" ? 1 : limits.translationItems)
    || texts.reduce((sum, text) => sum + Buffer.byteLength(text, "utf8"), 0) > maximum * 4) {
    throw new ProviderWorkError(kind === "audio" ? "text_too_long" : "translation_input_too_large", 400);
  }
  return characters;
}
/** Bound bytes before JSON parsing; escaped Unicode and metadata get an explicit envelope. */
export async function readProviderJson(request: Request, kind: "translation" | "audio"): Promise<any> {
  const limits = providerInputLimits();
  const maxBytes = (kind === "audio" ? limits.audioCharacters : limits.translationCharacters) * 12 + 32768;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ProviderWorkError("request_too_large", 400); }
      chunks.push(chunk.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
  } finally { reader.releaseLock(); }
}
export const providerWorkIdentity = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const translationPurposes = new Set(["youtube-phrase-practice", "youtube-recall", "youtube-span-translation", "pontix-phrase", "manual-dictionary-card", "dictionary-headword", "dictionary-meaning"]);
export function assertTranslationPurpose(purpose: string) {
  if (!translationPurposes.has(purpose)) throw new ProviderWorkError("unsupported_translation_purpose", 400);
}
function admissionLimits(kind: ProviderWorkKind) {
  const family = kind === "text" || kind === "draft" ? "TRANSLATION" : "AUDIO";
  const maxInput = family === "AUDIO" ? providerInputLimits().audioCharacters : providerInputLimits().translationCharacters;
  const prefix = `PROVIDER_${family}_`;
  const accountRequests = setting(`${prefix}REQUESTS_PER_MINUTE`, 20, 1000);
  const globalRequests = setting(`${prefix}GLOBAL_REQUESTS_PER_MINUTE`, 200, 10_000);
  return {
    accountRequests, globalRequests,
    accountCharacters: setting(`${prefix}CHARACTERS_PER_MINUTE`, maxInput * accountRequests, 100_000_000),
    globalCharacters: setting(`${prefix}GLOBAL_CHARACTERS_PER_MINUTE`, maxInput * globalRequests, 1_000_000_000),
    accountConcurrency: setting(`${prefix}ACCOUNT_CONCURRENCY`, 2, 32),
    globalConcurrency: setting(`${prefix}GLOBAL_CONCURRENCY`, 2, 128),
  };
}
async function rpc(name: string, args: Record<string, unknown>) {
  const service = getPlatformServiceSupabase();
  if (service instanceof Response) throw new ProviderWorkError("provider_work_unavailable", 503);
  // A lost response may have committed; never execute without a confirmed claim.
  const { data, error } = await service.supabase.rpc(name, args).abortSignal(AbortSignal.timeout(10_000));
  if (error) throw new ProviderWorkError("provider_work_unavailable", 503);
  return data;
}
export async function readProviderArtifact(kind: ProviderWorkKind, identity: string): Promise<Record<string, unknown> | null> {
  return rpc("read_provider_work_v1", { p_kind: kind, p_identity: identity });
}
export type ProviderWorkResult<T> = { status: "ready"; result: T; cached: boolean } | { status: "pending"; retryAfterMs: number };
/** DB transaction ends before I/O. Only the confirmed lease owner may publish.
 * Failed/expired leases get at most three attempts, then a 15-minute cooldown.
 */
export async function runProviderWork<T extends Record<string, unknown>>(input: {
  kind: ProviderWorkKind; identity: string; accountId: string; inputCharacters: number;
  execute: () => Promise<T>; failureCode?: (error: unknown) => string;
}): Promise<ProviderWorkResult<T>> {
  const args = { p_kind: input.kind, p_identity: input.identity };
  const claim = await rpc("begin_provider_work_v1", {
    ...args, p_account_id: input.accountId, p_input_characters: input.inputCharacters, p_limits: admissionLimits(input.kind),
  });
  if (claim?.status === "ready") return { status: "ready", result: claim.result as T, cached: true };
  if (claim?.status === "pending") return { status: "pending", retryAfterMs: claim.retryAfterMs };
  if (claim?.status === "limited") throw new ProviderWorkError("rate_limited", 429, claim.retryAfterMs);
  if (claim?.status === "failed") throw new ProviderWorkError(claim.error ?? "provider_unknown_error", 502, claim.retryAfterMs);
  if (claim?.status !== "claimed" || typeof claim.leaseToken !== "string") throw new ProviderWorkError("provider_work_unavailable", 503);
  let result: T;
  try {
    result = await withProviderDeadline(input.execute);
  } catch (error) {
    const code = error instanceof ProviderOperationTimeout ? "provider_timeout" : input.failureCode?.(error) ?? "audio_generation_failed";
    const finished = await rpc("finish_provider_work_v1", { ...args, p_lease_token: claim.leaseToken, p_error_code: code });
    if (finished !== true) throw new ProviderWorkError("provider_work_lease_lost", 503, 1000);
    throw new ProviderWorkError(code, 502, claim.attempt === 3 ? 900_000 : claim.attempt === 2 ? 20_000 : 5000);
  }
  // An unconfirmed completion is left to lease recovery. Never reclassify it as a provider failure.
  const finished = await rpc("finish_provider_work_v1", { ...args, p_lease_token: claim.leaseToken, p_result: result });
  if (finished !== true) throw new ProviderWorkError("provider_work_lease_lost", 503, 1000);
  return { status: "ready", result, cached: false };
}
export function providerErrorResponse(error: unknown) {
  const known = error instanceof ProviderWorkError ? error : new ProviderWorkError("provider_work_unavailable", 503);
  return { payload: { status: "failed", error: known.code, ...(known.retryAfterMs ? { retryAfterMs: known.retryAfterMs } : {}) }, status: known.httpStatus };
}
