import {describe, expect, it} from 'vitest';
import {emptyBulkArticleSelection, reconcileBulkArticleSelection, setBulkArticlesSelected} from '@/components/training/wordlist/bulkArticleSelection';

describe('explicit bulk article selection', () => {
  it('retains manual choices across pages and selects only the requested page', () => {
    let state = emptyBulkArticleSelection('user-a', 'filter-a');
    state = setBulkArticlesSelected(state, ['page1-a'], true);
    state = setBulkArticlesSelected(state, ['page2-a', 'page2-b', 'page2-a'], true);
    state = setBulkArticlesSelected(state, ['page2-a', 'page2-b'], false);
    expect([...state.articleIds]).toEqual(['page1-a']);
  });
  it('discards selection when account or filter changes', () => {
    const state = setBulkArticlesSelected(emptyBulkArticleSelection('user-a', 'filter-a'), ['article'], true);
    expect(reconcileBulkArticleSelection(state, 'user-a', 'filter-a')).toBe(state);
    expect(reconcileBulkArticleSelection(state, 'user-b', 'filter-a').articleIds.size).toBe(0);
    expect(reconcileBulkArticleSelection(state, 'user-a', 'filter-b').articleIds.size).toBe(0);
  });
});
