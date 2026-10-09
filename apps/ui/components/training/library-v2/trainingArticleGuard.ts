/** Snapshot of the exercise behind the article, independent of expanded meaning. */
export type TrainingArticleGuard = {entryId: string; headwordGroupId: string | null};

export function trainingArticleProtection(guard: TrainingArticleGuard | undefined, entryId: string, headwordGroupId: string) {
  const active = guard?.entryId === entryId;
  // Legacy callers without group identity fail closed for word-wide actions.
  const headword = Boolean(guard && (!guard.headwordGroupId || guard.headwordGroupId === headwordGroupId));
  return {active, headword};
}
