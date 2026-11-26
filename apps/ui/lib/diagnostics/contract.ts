/** Deliberately excludes content, URLs, user ids and arbitrary error messages. */
export const providerActionEvents = {
  audio_playback: { requested: "audio_play_requested", ready: "audio_play_started", pending: "audio_play_pending", failed: "audio_play_failed", cancelled: "audio_play_cancelled" },
  dictionary_translation: { requested: "translation_requested", ready: "translation_ready", pending: "translation_pending", failed: "translation_failed", cancelled: "translation_cancelled" },
} as const;
export type ProviderAction = keyof typeof providerActionEvents;
export const diagnosticKinds = [
  ...Object.values(providerActionEvents.audio_playback),
  ...Object.values(providerActionEvents.dictionary_translation),
  "library_refresh_failed",
  "load_started",
  "load_ready",
  "load_failed",
  "load_cancelled",
  "load_stalled",
  "request_ready",
  "request_failed",
  "request_cancelled",
] as const;
export type DiagnosticKind = (typeof diagnosticKinds)[number];
export type TrainingDiagnostic = {
  eventId: string;
  kind: DiagnosticKind;
  operation: "transition" | "display" | "lookup" | "request" | ProviderAction | "library_refresh";
  transitionId?: string;
  requestId?: string;
  displayId?: string;
  durationMs: number;
  status?: number;
  foreground: boolean;
  online: boolean;
};
export const diagnosticId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
export function parseTrainingDiagnostics(
  value: unknown,
): TrainingDiagnostic[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20)
    return null;
  const allowed = new Set([
    "eventId",
    "kind",
    "operation",
    "transitionId",
    "requestId",
    "displayId",
    "durationMs",
    "status",
    "foreground",
    "online",
  ]);
  for (const e of value) {
    if (
      !e ||
      typeof e !== "object" ||
      Array.isArray(e) ||
      Object.keys(e).some((k) => !allowed.has(k)) ||
      !diagnosticId(e.eventId) ||
      !diagnosticKinds.includes(e.kind) ||
      !["transition", "display", "lookup", "request", "library_refresh", ...Object.keys(providerActionEvents)].includes(e.operation) ||
      !validProviderPair(e) ||
      ((e.kind === "library_refresh_failed") !== (e.operation === "library_refresh")) ||
      (e.transitionId !== undefined && !diagnosticId(e.transitionId)) ||
      (e.requestId !== undefined && !diagnosticId(e.requestId)) ||
      (e.displayId !== undefined && !diagnosticId(e.displayId)) ||
      !Number.isFinite(e.durationMs) ||
      e.durationMs < 0 ||
      e.durationMs > 86_400_000 ||
      (e.status !== undefined &&
        (!Number.isInteger(e.status) || e.status < 100 || e.status > 599)) ||
      typeof e.foreground !== "boolean" ||
      typeof e.online !== "boolean"
    )
      return null;
  }
  return value;
}

const providerActionId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validProviderPair(event: TrainingDiagnostic) {
  for (const [name, events] of Object.entries(providerActionEvents)) {
    const matches = Object.values<string>(events).includes(event.kind);
    if (matches || name === event.operation) {
      return matches && name === event.operation &&
        providerActionId.test(event.eventId) && typeof event.requestId === "string" && providerActionId.test(event.requestId) &&
        event.displayId === undefined && event.transitionId === undefined && event.status === undefined;
    }
  }
  return true;
}
