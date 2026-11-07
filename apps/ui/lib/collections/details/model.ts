/** Presentation contract. Canonical source identity and artifacts stay outside this DTO. */
export type CollectionSourceDetails = {
  materialKind: 'video' | 'article' | 'text' | 'book' | 'other' | null;
  originKind: 'youtube' | 'web' | 'local_file' | 'manual' | 'other' | null;
  materialTitle: string | null;
  creatorName: string | null;
  url: string | null;
  fileName: string | null;
};

export type CollectionDetails = {
  id: string;
  name: string;
  description: string | null;
  itemCount: number | null;
  /** null means this adapter cannot provide a write revision. */
  revision: string | null;
  source: CollectionSourceDetails | null;
  sourceStatus: 'not-supported' | 'not-specified' | 'available';
  capabilities: {
    canEditDetails: boolean;
    canEditSource: boolean;
    canEditLabels: boolean;
  };
  persistence: 'saved' | 'preview';
};

/** Omitted fields are unchanged; null explicitly clears an optional value. */
export type CollectionDetailsPatch = {
  name?: string;
  description?: string | null;
  source?: Partial<CollectionSourceDetails> | null;
};

export type CollectionDetailsState =
  | { status: 'loading' }
  | { status: 'ready' | 'saving'; details: CollectionDetails }
  | { status: 'error' | 'conflict'; details?: CollectionDetails }
  | { status: 'unavailable' };

/** Save is absent when this controller has no authoritative write adapter. */
export type CollectionDetailsController = {
  state: CollectionDetailsState;
  retry?: () => void;
  save?: (patch: CollectionDetailsPatch, expectedRevision: string) => Promise<void>;
};
