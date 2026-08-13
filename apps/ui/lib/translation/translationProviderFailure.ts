import crypto from "crypto";

export const TRANSLATION_PROVIDER_FAILURE_CODES = [
  "provider_http_error",
  "provider_response_error",
  "provider_empty_response",
  "provider_timeout",
  "provider_network_error",
  "provider_fallback_error",
  "provider_unknown_error",
] as const;

export type TranslationProviderFailureCode =
  (typeof TRANSLATION_PROVIDER_FAILURE_CODES)[number];

export type TranslationProviderFailure = {
  code: TranslationProviderFailureCode;
  fingerprint: string;
};

export class SafeTranslationProviderError extends Error {
  readonly failure: TranslationProviderFailure;

  constructor(failure: TranslationProviderFailure) {
    super(`${failure.code}:${failure.fingerprint}`);
    this.name = "SafeTranslationProviderError";
    this.failure = failure;
  }
}

function diagnosticText(value: unknown): string {
  if (value instanceof SafeTranslationProviderError) {
    return `${value.failure.code}:${value.failure.fingerprint}`;
  }
  if (value instanceof Error) return `${value.name}:${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function translationProviderFailure(
  code: TranslationProviderFailureCode,
  diagnostic: unknown,
): TranslationProviderFailure {
  return {
    code,
    fingerprint: crypto
      .createHash("sha256")
      .update(`${code}\0${diagnosticText(diagnostic)}`)
      .digest("hex")
      .slice(0, 24),
  };
}

export function safeTranslationProviderError(
  code: TranslationProviderFailureCode,
  diagnostic: unknown,
): SafeTranslationProviderError {
  return new SafeTranslationProviderError(
    translationProviderFailure(code, diagnostic),
  );
}

export function normalizeTranslationProviderError(
  error: unknown,
  fallbackCode: TranslationProviderFailureCode = "provider_unknown_error",
): SafeTranslationProviderError {
  if (error instanceof SafeTranslationProviderError) return error;
  return safeTranslationProviderError(fallbackCode, error);
}

