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

export function translationProviderFailure(
  code: TranslationProviderFailureCode,
  _diagnostic?: unknown,
): TranslationProviderFailure {
  return {
    code,
    fingerprint: crypto
      .createHash("sha256")
      // The fingerprint deliberately contains no provider-controlled text.
      // It correlates the closed failure class only; raw diagnostics remain
      // below this boundary and cannot be guessed from the public artifact.
      .update(`translation-provider-failure-v1\0${code}`)
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
