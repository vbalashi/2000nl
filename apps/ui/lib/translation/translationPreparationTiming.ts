let durationMs = 30_000;
let observedDurablePreparation = false;
export function recordTranslationPreparationDuration(ms: number) {
  if (Number.isFinite(ms) && ms > 0) {
    observedDurablePreparation = true;
    durationMs = durationMs * 0.7 + Math.min(ms, 300_000) * 0.3;
  }
}
export function translationBufferDepth(paceMs: number) {
  // Keep the synchronous fallback at its existing one-member lead.
  if (!observedDurablePreparation) return 1;
  return Math.max(1, Math.min(3, Math.ceil(durationMs / Math.max(5_000, paceMs))));
}
