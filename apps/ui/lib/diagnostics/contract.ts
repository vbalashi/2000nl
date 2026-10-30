/** Deliberately excludes content, URLs, user ids and arbitrary error messages. */
export const diagnosticKinds = [
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
  operation: "transition" | "display" | "lookup" | "request";
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
      !["transition", "display", "lookup", "request"].includes(e.operation) ||
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
