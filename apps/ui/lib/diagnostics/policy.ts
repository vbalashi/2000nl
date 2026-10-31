import type { TrainingDiagnostic } from "./contract";
export type DiagnosticPolicy = { enabled: boolean; detailed: boolean; successSampleRate: number; validUntil: number };
export const disabledDiagnosticPolicy = (): DiagnosticPolicy => ({enabled:false,detailed:false,successSampleRate:0,validUntil:0});
export function sampleDiagnostic(key: string, rate: number) {
  let hash=2166136261;
  for (const char of key) hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return (hash>>>0)/4294967296 < rate;
}
export function acceptsDiagnostic(policy: DiagnosticPolicy, event: TrainingDiagnostic) {
  if (!policy.enabled || policy.validUntil<=Date.now()) return false;
  return policy.detailed || ["load_failed","load_stalled","request_failed"].includes(event.kind) ||
    sampleDiagnostic(event.displayId ?? event.transitionId ?? event.requestId ?? event.eventId,policy.successSampleRate);
}
