export const providerDiagnosticsSchema = 1;

export type MeasuredProvider = "openai" | "azure_openai" | "gemini" | "deepl" | "google_tts" | "azure_tts";
type AttemptOutcome = "ok" | "auth_denied" | "rate_limited" | "upstream_error" | "request_error" | "network_error" | "timeout";
type ConfigurationFault = "credential_invalid" | "quota_exhausted";

type ProviderEvent =
  | { kind: "transport_attempt"; provider: MeasuredProvider; durationMs: number; inputCharacters?: number; outcome: AttemptOutcome }
  | { kind: "provider_configuration"; provider: MeasuredProvider; outcome: ConfigurationFault }
  | { kind: "audio_resolution"; source: "prepared" | "cache" | "generated"; purpose: "prepare" | "resolve" };

export function recordProviderEvent(event: ProviderEvent) {
  try {
    const service = event.kind === "audio_resolution" || event.provider === "google_tts" || event.provider === "azure_tts" ? "audio" : "translation";
    console.info(JSON.stringify({
      channel: "provider_diagnostics", schema: providerDiagnosticsSchema,
      receivedAt: new Date().toISOString(), service, ...event,
    }));
  } catch { /* A telemetry failure must not change provider behavior. */ }
}

export function httpAttemptOutcome(status: number): AttemptOutcome {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403) return "auth_denied";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  return status >= 500 ? "upstream_error" : "request_error";
}

export function rpcAttemptOutcome(error: unknown): AttemptOutcome {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  switch (code) {
    case 4: return "timeout";
    case 7: case 16: return "auth_denied";
    case 8: return "rate_limited";
    case 13: case 14: return "upstream_error";
    default: return "network_error";
  }
}

/** Called only on errors already read by the provider adapter. Never log a body or message. */
export function recordProviderConfigurationFault(provider: MeasuredProvider, status: number, body: string) {
  let outcome: ConfigurationFault | undefined;
  if (provider === "deepl" && status === 456) {
    outcome = "quota_exhausted";
  } else if (body.length <= 32_768) {
    try {
      const { error } = JSON.parse(body);
      if (provider === "openai" || provider === "azure_openai") {
        if (status === 401 && error?.code === "invalid_api_key") outcome = "credential_invalid";
        if (status === 429 && error?.code === "insufficient_quota") outcome = "quota_exhausted";
      } else if ((provider === "gemini" || provider === "google_tts") && [400, 401, 403].includes(status)) {
        if (Array.isArray(error?.details) && error.details.some((d: {reason?: string; domain?: string} | null) =>
          d?.domain === "googleapis.com" && d.reason === "API_KEY_INVALID")) outcome = "credential_invalid";
      }
    } catch { /* Non-JSON responses have no confirmed machine-readable fault. */ }
  }
  if (outcome) recordProviderEvent({ kind: "provider_configuration", provider, outcome });
}
