// Presentation policy is separate from localized text and draft behavior.
export const exerciseSummaryPolicy = {
  meaning: { direction: true },
  idiom: { direction: true },
  'word-in-context': { direction: false },
} as const;
export function exerciseSummary(family: keyof typeof exerciseSummaryPolicy, label: string, direction: string) {
  return [label, exerciseSummaryPolicy[family].direction ? direction : null].filter(Boolean).join(' · ');
}
