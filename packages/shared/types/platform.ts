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
  isEditable?: boolean | null;
  sourceProvider?: string | null;
  sourceVersion?: string | null;
  minimumSubscriptionTier?: string | null;
  visibleToGroups?: string[];
  accessPolicyKey?: string | null;
  schemaKey?: string | null;
  schemaVersion?: number | null;
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

export type UserDictionaryEntryV1 = {
  headword: string;
  languageCode: string;
  definition?: string;
  translation?: {
    languageCode?: string;
    text: string;
  };
  example?: {
    source: string;
    translation?: string;
  };
  partOfSpeech?: string;
  gender?: string;
  notes?: string;
  tags?: string[];
  sourceEntryId?: string;
};

export type EntryListKind = "curated" | "user";
export type ListCardPolicy = "inherit" | "prefer" | "restrict";

export type EntryListSummary = {
  id: string;
  kind: EntryListKind;
  name: string;
  description?: string | null;
  ownerUserId?: string | null;
  primaryLanguageCode?: string | null;
  defaultScenarioId?: string | null;
  cardPolicy?: ListCardPolicy;
  cardTypeIds?: CardTypeId[] | null;
  itemCount?: number;
};

export type EntryListItemRef = {
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

export type UserEntryProgressSummary = {
  status: "new" | "seen" | "learning" | "reviewing" | "hidden" | "mixed";
  trackedCardCount: number;
  reviewedCardCount: number;
  learningCardCount: number;
  hiddenCardCount: number;
  strongestCardTypeId?: CardTypeId | null;
  weakestCardTypeId?: CardTypeId | null;
  lastReviewedAt?: string | null;
  nextReviewAt?: string | null;
};

export type LookupIntent =
  | "dictionary-lookup"
  | "training-review"
  | "external-click";

export type LookupActionId =
  | "record-view"
  | "add-to-list"
  | "remove-from-list"
  | "copy-to-user-dictionary"
  | "create-user-entry"
  | "update-user-entry"
  | "delete-user-entry"
  | "create-user-list"
  | "update-user-list"
  | "delete-user-list"
  | "mark-known"
  | "mark-unknown"
  | "review-card"
  | "start-learning";

export type DictionaryLookupRequest = {
  userId?: string;
  query: string;
  languageCode?: string;
  dictionaryIds?: string[];
  contextText?: string;
  includeUserState?: boolean;
  intent?: LookupIntent;
};

export type PlatformLookupMatchRelation =
  | "exact"
  | "inflection"
  | "lemma"
  | "fuzzy"
  | "unknown";

export type PlatformLookupMatch = {
  queriedForm: string;
  matchedForm?: string;
  relation: PlatformLookupMatchRelation;
};

export type PlatformCardCapabilityPhase =
  | "not-started"
  | "encountered"
  | "learning"
  | "reviewing"
  | "hidden"
  | "frozen";

export type PlatformCardCapability = {
  phase: PlatformCardCapabilityPhase;
  actions: LookupActionId[];
  reviewResults: Array<"fail" | "hard" | "success" | "easy">;
  frozenUntil?: string | null;
};

export type DictionaryLookupResult = {
  entry: DictionaryEntryRef & {
    content?: DictionaryEntryEnvelope;
    contentFingerprint?: string;
    raw?: unknown;
    gender?: string | null;
    isNt22000?: boolean | null;
    meaningsCount?: number | null;
  };
  dictionary: DictionarySummary | null;
  listMemberships?: EntryListSummary[];
  userStateByCardType?: Record<CardTypeId, UserCardState>;
  progressSummary?: UserEntryProgressSummary;
  cardCapabilitiesByType?: Record<CardTypeId, PlatformCardCapability>;
  match?: PlatformLookupMatch;
  availableActions?: LookupActionId[];
};

export type PlatformLookupApiRequest = {
  query: string;
  languageCode?: string;
  contextText?: string;
  includeUserState?: boolean;
  intent?: LookupIntent;
};

export type PlatformLookupApiResponse = {
  query: string;
  request?: {
    languageCode?: string | null;
    contextText?: string | null;
    intent?: LookupIntent | null;
  };
  items: DictionaryLookupResult[];
};

export type PlatformTranslationStatus = "pending" | "ready" | "failed";

export type PlatformTranslationApiRequest = {
  entryId: string;
  targetLang?: string;
  force?: boolean;
};

export type PlatformTranslationApiResponse = {
  entryId: string;
  targetLang: string;
  status?: PlatformTranslationStatus;
  overlay?: unknown;
  note?: string | null;
  error?: string | null;
};

export type PlatformSessionApiResponse = {
  user: {
    id: string;
    email: string | null;
  };
  preferences: {
    translationTargetLanguageCode: string | null;
    updatedAt: string | null;
  };
};

export type PlatformTextTranslationPurpose =
  | "youtube-recall"
  | "show-translation"
  | "external-client"
  | string;

export type PlatformTextTranslationApiRequest = {
  text: string;
  sourceLanguageCode?: string;
  targetLanguageCode?: string;
  purpose?: PlatformTextTranslationPurpose;
  contextText?: string;
};

export type PlatformTextTranslationApiResponse = {
  text: string;
  translatedText: string;
  sourceLanguageCode: string | null;
  targetLanguageCode: string;
  purpose: PlatformTextTranslationPurpose | null;
  provider: string;
};

export type PlatformAnalyzeSelectionRequest = {
  selection?: string;
  query?: string;
  includeUserState?: boolean;
};

export type PlatformAnalyzeSelectionResponse = {
  lookup: PlatformLookupApiResponse;
  actionResults: [];
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
    }
  | {
      action: "remove-from-list";
      entryId: string;
      listId: string;
    }
  | {
      action: "copy-to-user-dictionary";
      entryId: string;
      targetDictionaryId?: string | null;
      overrides?: Partial<UserDictionaryEntryV1>;
    }
  | {
      action: "create-user-entry";
      dictionaryId?: string | null;
      entry: UserDictionaryEntryV1;
    }
  | {
      action: "update-user-entry";
      entryId: string;
      entry: UserDictionaryEntryV1;
    }
  | {
      action: "delete-user-entry";
      entryId: string;
    }
  | {
      action: "create-user-list";
      name: string;
      description?: string | null;
      languageCode?: string | null;
      primaryLanguageCode?: string | null;
      defaultScenarioId?: string | null;
      cardPolicy?: ListCardPolicy | null;
      cardTypeIds?: CardTypeId[] | null;
    }
  | {
      action: "update-user-list";
      listId: string;
      name?: string;
      description?: string | null;
      languageCode?: string | null;
      primaryLanguageCode?: string | null;
      defaultScenarioId?: string | null;
      cardPolicy?: ListCardPolicy | null;
      cardTypeIds?: CardTypeId[] | null;
    }
  | {
      action: "delete-user-list";
      listId: string;
    };

export type PlatformActionResponse = {
  ok: true;
  action: PlatformActionRequest["action"];
  entryId?: string;
  cardTypeId?: CardTypeId;
  result?: "fail" | "hard" | "success" | "easy" | "freeze" | "hide";
  turnId?: string | null;
  listId?: string;
  copiedEntryId?: string;
  targetDictionaryId?: string | null;
  dictionaryId?: string | null;
  list?: EntryListSummary;
};
