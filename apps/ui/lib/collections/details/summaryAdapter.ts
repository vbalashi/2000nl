import type { WordListSummary } from '../../types';
import type { CollectionDetails } from './model';

/** Read-only bridge for the existing catalog, not a details persistence API.
 * Call only for a row in the current authorized catalog; discard on access loss.
 * Label capabilities must come from the existing label controller, never metadata.
 */
export function collectionDetailsFromSummary(
  summary: WordListSummary,
  capabilities: { canEditLabels: boolean },
): CollectionDetails {
  return {
    id: summary.id,
    name: summary.name,
    description: summary.description ?? null,
    itemCount: summary.item_count ?? null,
    revision: null,
    source: null,
    sourceStatus: 'not-supported',
    capabilities: {
      canEditDetails: false,
      canEditSource: false,
      canEditLabels: capabilities.canEditLabels,
    },
    persistence: 'saved',
  };
}
