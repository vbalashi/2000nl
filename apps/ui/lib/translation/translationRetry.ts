import crypto from "node:crypto";

export type TranslationAttemptDiagnostic = {
  stage: "request" | "response" | "contract";
  status?: number;
  model?: string;
  reason?: "http_status" | "timeout" | "network" | "invalid_json" | "empty_content" | "incomplete" | "contract_invalid" | "provider_reported_error";
  requestId?: string;
  inputTokens?: number;
  outputTokens?: number;
  retryAfterMs?: number;
};
export type TranslationAttemptLog = TranslationAttemptDiagnostic & {
  event: "translation_attempt";
  correlationId: string;
  attempt: number;
  elapsedMs: number;
  outcome: "ready" | "failed";
  failureCode?: string;
  retry: boolean;
  retryDelayMs: number;
};
export function safeProviderRequestId(value: string | null): string | undefined {
  return value && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : undefined;
}
export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const n = Number(value), ms = Number.isFinite(n) ? n * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, 30_000) : undefined;
}
/** Log only closed codes and allowlisted numeric metadata; never provider text. */
export async function withTranslationRetries<T>(
  operation: (diagnostic: TranslationAttemptDiagnostic) => Promise<T>,
  options: {
    maxRetries?: number;
    log: (event: TranslationAttemptLog) => void;
    classify: (error: unknown) => "provider_timeout" | "provider_network_error" | "provider_http_error" | "provider_response_error" | "provider_empty_response" | "provider_unknown_error" | "provider_fallback_error";
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 3) throw new Error("invalid_translation_retry_limit");
  const correlationId = crypto.randomUUID();
  for (let attempt = 1; ; attempt++) {
    const diagnostic: TranslationAttemptDiagnostic = { stage: "request" }, started = Date.now();
    try {
      const value = await operation(diagnostic);
      options.log({ ...diagnostic, event: "translation_attempt", correlationId, attempt, elapsedMs: Date.now() - started, outcome: "ready", retry: false, retryDelayMs: 0 });
      return value;
    } catch (error) {
      const failureCode = options.classify(error);
      if (!diagnostic.reason && diagnostic.stage === "contract") diagnostic.reason = "contract_invalid";
      const transient = failureCode === "provider_timeout" || failureCode === "provider_network_error" ||
        (failureCode === "provider_http_error" && (diagnostic.status === 429 || (diagnostic.status !== undefined && diagnostic.status >= 500 && diagnostic.status <= 599)));
      const retry = transient && attempt <= maxRetries;
      const retryDelayMs = retry ? Math.max(300 * 2 ** (attempt - 1), diagnostic.retryAfterMs ?? 0) : 0;
      options.log({ ...diagnostic, event: "translation_attempt", correlationId, attempt, elapsedMs: Date.now() - started, outcome: "failed", failureCode, retry, retryDelayMs });
      if (!retry) throw error;
      await (options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(retryDelayMs);
    }
  }
}
