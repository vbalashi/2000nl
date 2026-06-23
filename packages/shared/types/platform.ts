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
  dictionaryId: string | null;
  languageCode: string | null;
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

export type DictionaryContentSection = {
  id: string;
  sourcePath: string;
  kind: "meaning" | "context" | "example" | "idiom" | "form" | "note";
  label?: string;
  text: string;
  translation?: string;
};

export type DictionaryContentSummary = {
  definition: string;
  definitionTranslation?: string;
  example?: string;
  exampleTranslation?: string;
};

export type PlatformLookupTranslationStatus =
  | "ready"
  | "pending"
  | "failed"
  | "not_requested"
  | "not_available";

export type PlatformLookupTranslation = {
  status: PlatformLookupTranslationStatus;
  targetLanguageCode?: string;
  translationId?: string;
  translationPolicyVersion?: string;
  error?: {
    code: string;
    message?: string;
  };
};

export type DictionaryEntryEnvelope = {
  headword: string;
  headwordTranslation?: string;
  languageCode: string | null;
  meaningId?: number | null;
  partOfSpeech?: string | null;
  gender?: string | null;
  meanings: DictionaryMeaningContent[];
  summary: DictionaryContentSummary;
  audioLinks?: Record<string, string | null>;
  images?: string[];
  morphology?: Record<string, unknown>;
  sections: DictionaryContentSection[];
  translation?: PlatformLookupTranslation;
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
  includeTranslations?: boolean;
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
  reviewResults?: Array<"fail" | "hard" | "success" | "easy">;
  frozenUntil?: string | null;
};

export type DictionaryLookupResult = {
  entry: DictionaryEntryRef & {
    content: DictionaryEntryEnvelope;
    contentFingerprint: string;
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
  translation?: PlatformLookupTranslation;
  match: PlatformLookupMatch;
  availableActions?: LookupActionId[];
};

export type PlatformLookupApiRequest = {
  query: string;
  languageCode?: string;
  contextText?: string;
  includeUserState?: boolean;
  includeTranslations?: boolean;
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

export type PlatformTranslationOverlay = {
  headword?: string;
  meanings?: Array<{
    definition?: string;
    context?: string;
    examples?: string[];
    idioms?: Array<string | { expression?: string; explanation?: string }>;
  }>;
  __meta?: {
    providerSelected?: "deepl" | "openai" | "gemini";
    providerUsed?: "deepl" | "openai" | "gemini";
    usedFallback?: boolean | null;
    primaryError?: string | null;
    promptFingerprint?: string | null;
    translatedPaths?: Array<Array<string | number>>;
  };
};

export type PlatformTranslationApiResponse = {
  entryId: string;
  targetLang: string;
  status?: PlatformTranslationStatus;
  overlay?: PlatformTranslationOverlay | null;
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
    source: "user-setting" | "platform-default";
    updatedAt: string | null;
  };
};

export type PlatformTextTranslationPurpose =
  | "youtube-phrase-practice"
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
  translationId: string;
  status: PlatformTranslationStatus;
  sourceTextHash: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  translatedText?: string;
  translationPolicyVersion: string;
  cached: boolean;
  error?: string | null;
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

export type PlatformSourceContextV1 = {
  contractVersion?: "source-context-v1";
  client?: {
    id?: string;
    version?: string;
  };
  source?: {
    kind?: string;
    provider?: string;
    externalId?: string;
    url?: string;
    title?: string;
    languageCode?: string;
  };
  location?: {
    kind?: string;
    startMs?: number;
    endMs?: number;
    phraseIndex?: number;
  };
  context?: {
    clickedForm?: string;
    text?: string;
  };
  diagnostics?: Record<string, unknown>;
};

export type PlatformSourceContextV2 = {
  contractVersion: "source-context-v2";
  source: {
    kind: "youtube_video";
    provider: "youtube";
    externalId: string;
    languageCode?: string;
  };
  artifact?: {
    artifactKind: "caption_phrase_set";
    producer: string;
    snapshotRevisionId?: string;
    textSourceId?: string;
    textSourceRevisionId?: string;
    textContentFingerprint?: string;
    timingEvidenceRevisionId?: string;
    phraseSetRevisionId?: string;
    builderVersion?: string;
    languageCode?: string;
    quality?: string;
  };
  location?: {
    kind: "caption_phrase";
    startMs?: number;
    endMs?: number;
    phraseIndex?: number;
    locatorConfidence?: "canonical" | "derived" | "approximate";
    phraseTextHash?: string;
    timingQuality?: string;
  };
  selection?: {
    clickedForm?: string;
    tokenIndex?: number;
    charStart?: number;
    charEnd?: number;
    contextText?: string;
    contextTextHash?: string;
  };
  observation?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
};

export type PlatformActionProvenance = {
  clientEventId?: string | null;
  sourceContext?: PlatformSourceContextV1 | PlatformSourceContextV2 | null;
};

export type PlatformActionRequest =
  | ({
      action: "record-view" | "start-learning";
      entryId: string;
      cardTypeId: CardTypeId;
    } & PlatformActionProvenance)
  | ({
      action: "review-card";
      entryId: string;
      cardTypeId: CardTypeId;
      result: "fail" | "hard" | "success" | "easy" | "freeze" | "hide";
      turnId?: string | null;
    } & PlatformActionProvenance)
  | ({
      action: "mark-known" | "mark-unknown";
      entryId: string;
      cardTypeId: CardTypeId;
      turnId?: string | null;
    } & PlatformActionProvenance)
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
