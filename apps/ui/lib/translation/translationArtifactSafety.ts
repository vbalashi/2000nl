import type { TranslationOverlay } from "../types";
import {
  normalizeTranslationProviderError,
  TRANSLATION_PROVIDER_FAILURE_CODES,
  type TranslationProviderFailure,
} from "./translationProviderFailure";

const SAFE_ERROR_MESSAGE = new RegExp(
  `^(?:${TRANSLATION_PROVIDER_FAILURE_CODES.join("|")}):[a-f0-9]{24}$`,
);

export function sanitizeStoredTranslationError(
  value: unknown,
): string | null {
  if (typeof value !== "string" || !value) return null;
  if (SAFE_ERROR_MESSAGE.test(value)) return value;
  return normalizeTranslationProviderError(value).message;
}

export function sanitizeTranslationOverlay(
  value: unknown,
): TranslationOverlay | null {
  if (!isRecord(value)) return null;
  const { __meta: rawMeta, ...content } = value;
  if (!isRecord(rawMeta)) return content as TranslationOverlay;

  const providerSelected = asProvider(rawMeta.providerSelected);
  const providerUsed = asProvider(rawMeta.providerUsed);
  const usedFallback =
    typeof rawMeta.usedFallback === "boolean" ? rawMeta.usedFallback : null;
  const promptFingerprint = boundedString(rawMeta.promptFingerprint, 128);
  const translatedPaths = safeTranslatedPaths(rawMeta.translatedPaths);
  const primaryFailure = safePrimaryFailure(rawMeta.primaryFailure);
  const meta = {
    ...(providerSelected ? { providerSelected } : {}),
    ...(providerUsed ? { providerUsed } : {}),
    ...(usedFallback !== null ? { usedFallback } : {}),
    ...(primaryFailure ? { primaryFailure } : {}),
    ...(promptFingerprint ? { promptFingerprint } : {}),
    ...(translatedPaths ? { translatedPaths } : {}),
  };

  return {
    ...(content as TranslationOverlay),
    ...(Object.keys(meta).length ? { __meta: meta } : {}),
  };
}

function safePrimaryFailure(value: unknown): TranslationProviderFailure | null {
  if (!isRecord(value)) return null;
  const code = value.code;
  const fingerprint = value.fingerprint;
  if (
    typeof code !== "string" ||
    !TRANSLATION_PROVIDER_FAILURE_CODES.includes(
      code as TranslationProviderFailure["code"],
    ) ||
    typeof fingerprint !== "string" ||
    !/^[a-f0-9]{24}$/.test(fingerprint)
  ) {
    return null;
  }
  return { code: code as TranslationProviderFailure["code"], fingerprint };
}

function safeTranslatedPaths(value: unknown): Array<Array<string | number>> | null {
  if (!Array.isArray(value) || value.length > 128) return null;
  const paths: Array<Array<string | number>> = [];
  for (const candidate of value) {
    if (!Array.isArray(candidate) || candidate.length > 16) return null;
    const path: Array<string | number> = [];
    for (const token of candidate) {
      if (typeof token === "number" && Number.isSafeInteger(token)) {
        path.push(token);
      } else if (typeof token === "string" && token.length <= 128) {
        path.push(token);
      } else {
        return null;
      }
    }
    paths.push(path);
  }
  return paths;
}

function asProvider(
  value: unknown,
): "deepl" | "openai" | "gemini" | null {
  return value === "deepl" || value === "openai" || value === "gemini"
    ? value
    : null;
}

function boundedString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length <= maxLength ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
