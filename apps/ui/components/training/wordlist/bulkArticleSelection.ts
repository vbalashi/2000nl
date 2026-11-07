/** Explicit article selection belongs to one account and one immutable search scope. */
export type BulkArticleSelection = {
  accountId: string;
  scopeKey: string;
  articleIds: ReadonlySet<string>;
};

export function emptyBulkArticleSelection(accountId: string, scopeKey: string): BulkArticleSelection {
  return { accountId, scopeKey, articleIds: new Set() };
}

/** A scope or account change cannot carry a previous selection into a new operation. */
export function reconcileBulkArticleSelection(
  current: BulkArticleSelection,
  accountId: string,
  scopeKey: string,
): BulkArticleSelection {
  return current.accountId === accountId && current.scopeKey === scopeKey
    ? current : emptyBulkArticleSelection(accountId, scopeKey);
}

/** This changes only the supplied page or explicit subset, never all filtered results. */
export function setBulkArticlesSelected(
  current: BulkArticleSelection,
  ids: readonly string[],
  selected: boolean,
): BulkArticleSelection {
  const next = new Set(current.articleIds);
  for (const id of ids) {
    if (!id) continue;
    if (selected) next.add(id); else next.delete(id);
  }
  return { ...current, articleIds: next };
}
