export type DictionaryKind = "curated" | "user";

export type DictionaryVisibility = "system" | "private" | "shared" | "public";

export type DictionarySchemaFeature =
  | "definitions"
  | "translations"
  | "examples"
  | "idioms"
  | "audio"
  | "images"
  | "morphology"
  | "conjugation";

export type DictionarySchemaSummary = {
  id: string;
  version: string;
  languageCode?: string | null;
  title: string;
  features: DictionarySchemaFeature[];
};

export type DictionarySummary = {
  id: string;
  languageCode: string;
  slug: string;
  name: string;
  description?: string | null;
  kind: DictionaryKind;
  visibility: DictionaryVisibility;
  ownerUserId?: string | null;
  isEditable: boolean;
  sourceProvider?: string | null;
  sourceVersion?: string | null;
  minimumSubscriptionTier?: string | null;
  visibleToGroups?: string[];
  accessPolicyKey?: string | null;
  entrySchemaId?: string | null;
  entrySchemaVersion?: string | null;
};

export type DictionaryEntryRef = {
  id: string;
  dictionaryId: string;
  languageCode: string;
  headword: string;
  meaningId?: number | null;
  partOfSpeech?: string | null;
  sourceEntryId?: string | number | null;
  entrySchemaId?: string | null;
  entrySchemaVersion?: string | null;
};

export type DictionaryMeaningContent = {
  definition?: string | null;
  context?: string | null;
  examples?: string[];
  translations?: Record<string, string | string[]>;
  idioms?: Array<
    | string
    | {
        expression?: string;
        explanation?: string;
        translations?: Record<string, string | string[]>;
      }
  >;
};

export type DictionaryEntryEnvelope = {
  headword: string;
  languageCode: string;
  meaningId?: number | null;
  partOfSpeech?: string | null;
  gender?: string | null;
  meanings: DictionaryMeaningContent[];
  audioLinks?: Record<string, string | null>;
  images?: string[];
  morphology?: Record<string, unknown>;
  sourceMeta?: Record<string, unknown>;
};

export type WordListKind = "curated" | "user";

export type WordListSummaryV2 = {
  id: string;
  kind: WordListKind;
  name: string;
  description?: string | null;
  ownerUserId?: string | null;
  primaryLanguageCode?: string | null;
  itemCount?: number;
};

export type WordListEntryRef = {
  listId: string;
  entryId: string;
  dictionaryId: string;
  rank?: number | null;
  addedAt?: string;
};

export type CardTypeId =
  | "word-to-definition"
  | "definition-to-word"
  | "listen-recognize"
  | "listen-type"
  | string;

export type CardRef = {
  entryId: string;
  cardTypeId: CardTypeId;
  meaningId?: number | null;
};

export type UserCardStateRef = CardRef & {
  userId: string;
};

export type UserCardTelemetry = {
  clickCount: number;
  seenCount: number;
  successCount: number;
  lastSeenAt?: string | null;
  lastReviewedAt?: string | null;
};

export type UserCardSchedulingState = {
  nextReviewAt?: string | null;
  hidden: boolean;
  frozenUntil?: string | null;
  inLearning: boolean;
  fsrs?: {
    stability?: number | null;
    difficulty?: number | null;
    reps: number;
    lapses: number;
    lastGrade?: number | null;
    lastInterval?: number | null;
    paramsVersion: string;
  };
};

export type UserCardState = UserCardStateRef &
  UserCardTelemetry &
  UserCardSchedulingState;

export type LookupIntent =
  | "dictionary-lookup"
  | "training-review"
  | "external-click";

export type LookupActionId =
  | "record-view"
  | "add-to-list"
  | "create-user-entry-copy"
  | "mark-known"
  | "mark-unknown"
  | "review-card"
  | "start-learning";

export type DictionaryLookupRequest = {
  userId?: string;
  query: string;
  languageCode?: string;
  dictionaryIds?: string[];
  includeUserState?: boolean;
  intent?: LookupIntent;
};

export type DictionaryLookupResult = {
  entry: DictionaryEntryRef & {
    raw?: unknown;
    gender?: string | null;
    isNt22000?: boolean | null;
    meaningsCount?: number | null;
  };
  dictionary: DictionarySummary | null;
  listMemberships?: WordListSummaryV2[];
  userStateByCardType?: Record<CardTypeId, UserCardState>;
  availableActions?: LookupActionId[];
};

export type PlatformLookupApiRequest = {
  query: string;
  includeUserState?: boolean;
};

export type PlatformLookupApiResponse = {
  query: string;
  items: DictionaryLookupResult[];
};

export type PlatformActionRequest =
  | {
      action: "record-view" | "start-learning";
      entryId: string;
      cardTypeId: CardTypeId;
    }
  | {
      action: "review-card";
      entryId: string;
      cardTypeId: CardTypeId;
      result: "fail" | "hard" | "success" | "easy" | "freeze" | "hide";
      turnId?: string | null;
    }
  | {
      action: "mark-known" | "mark-unknown";
      entryId: string;
      cardTypeId: CardTypeId;
      turnId?: string | null;
    }
  | {
      action: "add-to-list";
      entryId: string;
      listId: string;
    };

export type PlatformActionResponse = {
  ok: true;
  action: PlatformActionRequest["action"];
  entryId: string;
  cardTypeId?: CardTypeId;
  result?: "fail" | "hard" | "success" | "easy" | "freeze" | "hide";
  turnId?: string | null;
  listId?: string;
};
