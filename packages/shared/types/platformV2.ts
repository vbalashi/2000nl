import type { CardTypeId, LookupIntent, PlatformSourceContextV2 } from "./platform";
import type { DisplayedTranslationArtifactIdentityV1 } from "../platform-v2/displayedTranslationArtifactIdentityV1";

export const PLATFORM_V2_CARD_TYPE_IDS = [
  "word-to-definition",
  "definition-to-word",
  "listen-recognize",
  "listen-type",
] as const;

export type PlatformV2CardTypeId = (typeof PLATFORM_V2_CARD_TYPE_IDS)[number];

export type PlatformSemanticTermV2 = {
  termId: string;
  messageKey: string;
  sourceValue?: string;
};

export type PlatformDictionarySummaryV2 = {
  dictionaryId: string;
  sourceLanguageCode: string;
  displayName: string;
  messageKey: string;
};

export type PlatformPresentationIndicatorV2 = {
  indicatorId: string;
  value: string;
  messageKey: string;
};

export type PlatformAudioCapabilityV2 = {
  audioId: string;
  actionId: "play-audio";
  contentLanguageCode: string;
};

export type PlatformHeadwordHeaderV2 = {
  text: string;
  homographNumber?: number;
  displayPronunciation?: string;
  pronunciation?: string;
  article?: string;
  partOfSpeech?: PlatformSemanticTermV2;
  audio?: PlatformAudioCapabilityV2;
};

export type PlatformContentNodeKindV2 =
  | "definition"
  | "usage-pattern"
  | "example"
  | "idiom"
  | "idiom-explanation"
  | "usage-note";

export type PlatformContentNodeTranslationV2 = {
  translationId: string;
  targetLanguageCode: string;
  status: "ready" | "pending" | "failed" | "not-available";
  text?: string;
  sourceTextFingerprint: string;
  translationPolicyVersion: string;
  providerRevision?: string;
  errorCode?: string;
};

export type PlatformContentNodeV2 = {
  contentNodeId: string;
  parentContentNodeId: string | null;
  kind: PlatformContentNodeKindV2;
  order: number;
  text: string;
  sourceTextFingerprint: string;
  translations: PlatformContentNodeTranslationV2[];
};

export type PlatformEntryTranslationStateV2 = {
  translationId: string;
  entryId: string;
  targetLanguageCode: string;
  status: "ready" | "pending" | "failed" | "not-available";
  text?: string;
  alternativeTexts?: string[];
  baseText?: string | null;
  note?: string | null;
  sourceContentFingerprint: string;
  translationPolicyVersion: string;
  providerRevision?: string;
  errorCode?: string;
  isFresh: boolean;
};

export type PlatformSenseCardTargetV2 = {
  kind: "sense-card";
  entryId: string;
  cardTypeId: CardTypeId;
  stateRevision: string;
};

export type PlatformEntryTargetV2 = {
  kind: "entry";
  entryId: string;
  contentRevision: string;
};

export type PlatformContentNodeTargetV2 = {
  kind: "content-node";
  entryId: string;
  contentNodeId: string;
  sourceTextFingerprint: string;
};

export type PlatformTrainingExerciseDirectionV2 = "direct" | "reverse";

export type PlatformTrainingExerciseReviewResultV2 =
  | "fail"
  | "hard"
  | "success"
  | "easy";

export type PlatformTrainingExerciseTargetV2 =
  | {
      kind: "training-exercise";
      targetId: string;
      family: "idiom";
      direction: PlatformTrainingExerciseDirectionV2;
      stateRevision: string;
    }
  | {
      kind: "training-exercise";
      targetId: string;
      family: "translation";
      direction: "recall";
      stateRevision: string;
    };

export type PlatformTrainingExerciseStateV2 = {
  stateRevision: string;
  fsrsStability: number | null;
  fsrsDifficulty: number | null;
  fsrsReps: number;
  fsrsLapses: number;
  fsrsLastGrade: number | null;
  fsrsLastInterval: number | null;
  fsrsTargetRetention: number | null;
  fsrsParamsVersion: string | null;
  fsrsEnabled: boolean;
  nextReviewAt: string | null;
  lastSeenAt: string | null;
  lastReviewedAt: string | null;
  seenCount: number;
  successCount: number;
  lastResult: PlatformTrainingExerciseReviewResultV2 | null;
  hidden: boolean;
  frozenUntil: string | null;
  inLearning: boolean;
  learningDueAt: string | null;
};

export type PlatformIdiomExerciseCandidateV2 = {
  targetId: string;
  targetKey: string;
  family: "idiom";
  direction: PlatformTrainingExerciseDirectionV2;
  entryId: string;
  contentNodeId: string;
  expressionSourcePath: string;
  explanationSourcePath: string;
  exampleSourcePaths: string[];
  sourceRevision: string;
  sourceTextFingerprint: string;
  queueSource: "new" | "learning" | "review";
  state: PlatformTrainingExerciseStateV2 | null;
};

export type PlatformIdiomExerciseCandidatesResponseV2 = {
  contractVersion: "platform-idiom-exercise-candidates-v2";
  family: "idiom";
  direction: PlatformTrainingExerciseDirectionV2;
  items: PlatformIdiomExerciseCandidateV2[];
};

export type PlatformIdiomExerciseSessionMemberV2 = {
  ordinal: number;
  targetId: string;
  queueSource: "new" | "learning" | "review";
  consumedAt: string | null;
  unavailableAt: string | null;
  unavailableReason: string | null;
  entryId: string;
  contentNodeId: string;
  family: "idiom";
  direction: PlatformTrainingExerciseDirectionV2;
};

export type PlatformIdiomExerciseSessionV2 = {
  contractVersion: "platform-idiom-exercise-session-v2";
  sessionId: string;
  exerciseFamily: "idiom";
  direction: PlatformTrainingExerciseDirectionV2;
  sessionSize: string;
  requestedTotal: number;
  plannedNew: number;
  plannedReview: number;
  plannedPractice: 0;
  plannedTotal: number;
  plannedAt: string;
  runStatus: "active" | "superseded";
  runGeneration: number | null;
  completedActions: number;
  completionReason: "completed" | "exhausted" | null;
  members: PlatformIdiomExerciseSessionMemberV2[];
};

export type PlatformIdiomExerciseSessionNextV2 =
  | (PlatformIdiomExerciseCandidateV2 & {
      status: "ready";
      sessionId: string;
      ordinal: number;
    })
  | {
      status: "completed" | "exhausted" | "superseded" | "not-member";
      sessionId?: string;
      completedActions?: number;
      requestedTotal?: number;
    }
  | {
      status: "unavailable";
      sessionId: string;
      ordinal: number;
      targetId: string;
      reason: "projection-missing" | "dictionary-access-revoked";
    remaining: number;
  };

export type PlatformTranslationExerciseCandidateV2 = {
  targetId: string;
  targetKey: string;
  family: "translation";
  direction: "recall";
  entryId: string;
  contentNodeId: string;
  sourcePath: string;
  sourceRevision: string;
  sourceTextFingerprint: string;
  queueSource: "new" | "learning" | "review";
  state: PlatformTrainingExerciseStateV2 | null;
};

export type PlatformTranslationExerciseCandidatesResponseV2 = {
  contractVersion: "platform-translation-exercise-candidates-v1";
  family: "translation";
  direction: "recall";
  items: PlatformTranslationExerciseCandidateV2[];
};

export type PlatformTranslationExerciseSessionMemberV2 = {
  ordinal: number;
  targetId: string;
  queueSource: "new" | "learning" | "review";
  consumedAt: string | null;
  unavailableAt: string | null;
  unavailableReason: string | null;
  entryId: string;
  contentNodeId: string;
  family: "translation";
  direction: "recall";
};

export type PlatformTranslationExerciseSessionV2 = {
  contractVersion: "platform-translation-exercise-session-v1";
  sessionId: string;
  exerciseFamily: "translation";
  direction: "recall";
  sessionSize: string;
  requestedTotal: number;
  plannedNew: number;
  plannedReview: number;
  plannedPractice: 0;
  plannedTotal: number;
  plannedAt: string;
  runStatus: "active" | "superseded";
  runGeneration: number | null;
  completedActions: number;
  completionReason: "completed" | "exhausted" | null;
  members: PlatformTranslationExerciseSessionMemberV2[];
};

export type PlatformTranslationExerciseSessionNextV2 =
  | (PlatformTranslationExerciseCandidateV2 & {
      status: "ready";
      sessionId: string;
      ordinal: number;
    })
  | {
      status: "completed" | "exhausted" | "superseded" | "not-member";
      sessionId?: string;
      completedActions?: number;
      requestedTotal?: number;
    }
  | {
      status: "unavailable";
      sessionId: string;
      ordinal: number;
      targetId: string;
      reason: "projection-missing" | "dictionary-access-revoked";
      remaining: number;
    };

export type PlatformTranslationTargetV2 = {
  kind: "translation";
} & DisplayedTranslationArtifactIdentityV1;

export type PlatformSenseCardCapabilityV2 =
  | {
      actionId: "start-learning" | "mark-known";
      elementId: string;
      messageKey: string;
      target: PlatformSenseCardTargetV2;
    }
  | {
      actionId: "undo-known";
      elementId: string;
      messageKey: string;
      target: PlatformSenseCardTargetV2 & {
        activeKnownMarkId: string;
        knownMarkRevision: string;
      };
    }
  | {
      actionId: "review-card";
      elementId: string;
      messageKey: string;
      target: PlatformSenseCardTargetV2;
      reviewResult: "fail" | "hard" | "success" | "easy";
    }
  | {
      actionId: "request-translation";
      elementId: string;
      messageKey: string;
      target: PlatformEntryTargetV2;
      targetLanguageCode: string;
    }
  | {
      actionId: "report-content";
      elementId: string;
      messageKey: string;
      target:
        | PlatformEntryTargetV2
        | PlatformContentNodeTargetV2
        | PlatformTranslationTargetV2;
    }
  | {
      actionId: "open-word-details";
      elementId: string;
      messageKey: string;
      target: PlatformEntryTargetV2;
    };

export type PlatformKnownMarkV2 = {
  markId: string;
  revision: string;
  markedAt: string;
};

export type PlatformSenseCardStateV2 = {
  cardTypeId: CardTypeId;
  scheduler: {
    phase:
      | "not-started"
      | "encountered"
      | "learning"
      | "reviewing"
      | "hidden"
      | "frozen";
    repeatCount?: number;
    lastSeenAt?: string | null;
    frozenUntil?: string | null;
  };
  knownMark: PlatformKnownMarkV2 | null;
  stateRevision: string;
};

export type PlatformDetailTextV2 = {
  detailId: string;
  text: string;
  contentNodeId?: string;
};

export type PlatformWordDetailsV2 = {
  entryId: string;
  lexicalRelations: Array<{
    relationId: string;
    kind: "synonym" | "antonym";
    text: string;
    targetEntryId?: string;
  }>;
  labels: PlatformSemanticTermV2[];
  grammarNotes: PlatformDetailTextV2[];
  usageNotes: PlatformDetailTextV2[];
  pronunciationNotes: PlatformDetailTextV2[];
  forms: Array<{
    formId: string;
    kind: PlatformSemanticTermV2;
    text: string;
    features: PlatformSemanticTermV2[];
  }>;
  references: Array<{
    referenceId: string;
    kind: PlatformSemanticTermV2;
    text: string;
    targetEntryId?: string;
  }>;
};

export type PlatformSenseCardEntryV2 = {
  kind: "sense-card";
  entryId: string;
  meaningOrdinal: number | null;
  partOfSpeech?: PlatformSemanticTermV2;
  card: PlatformSenseCardStateV2 | null;
  contentRevision: string;
  reportContentRevision: string | null;
  summaryContentNodeId: string | null;
  contentNodes: PlatformContentNodeV2[];
  translation: PlatformEntryTranslationStateV2 | null;
  capabilities: PlatformSenseCardCapabilityV2[];
  wordDetails?: PlatformWordDetailsV2;
};

export type PlatformCrossReferenceEntryV2 = {
  kind: "cross-reference";
  crossReferenceId: string;
  meaningOrdinal: number | null;
  label: PlatformSemanticTermV2 | null;
  text: string;
  target: {
    query: string;
    headwordGroupId?: string;
    entryId?: string;
  };
  capabilities: Array<{
    actionId: "follow-cross-reference";
    elementId: string;
    messageKey: string;
  }>;
};

export type PlatformEntryPresentationV2 =
  | PlatformSenseCardEntryV2
  | PlatformCrossReferenceEntryV2;

export type PlatformHeadwordGroupV2 = {
  headwordGroupId: string;
  dictionary: PlatformDictionarySummaryV2;
  header: PlatformHeadwordHeaderV2;
  senseCount: number;
  entryCount: number;
  indicators: PlatformPresentationIndicatorV2[];
  entries: PlatformEntryPresentationV2[];
};

type PlatformLookupV2RequestBase = {
  contentLanguageCode?: string | null;
  translationTargetLanguageCode?: string | null;
  cardTypeId: CardTypeId;
};

export type PlatformLookupV2Request = PlatformLookupV2RequestBase &
  (
    | {
        query: string;
        entryId?: never;
        intent?: LookupIntent;
        cursor?: string | null;
      }
    | {
        entryId: string;
        query?: never;
        intent: "training-review" | "dictionary-lookup";
        cursor?: never;
      }
  );

export type PlatformLookupV2Response = {
  contractVersion: "platform-lookup-v2";
  query: string;
  request: {
    contentLanguageCode: string | null;
    translationTargetLanguageCode: string | null;
    cardTypeId: CardTypeId;
    intent: LookupIntent;
  };
  groups: PlatformHeadwordGroupV2[];
  page: {
    selectedTierComplete: boolean;
    nextGroupCursor: string | null;
  };
};

export type PlatformActionV2Request =
  | {
      actionId: "start-learning" | "mark-known";
      clientEventId: string;
      trainingSessionId?: string;
      target: PlatformSenseCardTargetV2;
      sourceContext?: PlatformSourceContextV2;
    }
  | {
      actionId: "undo-known";
      clientEventId: string;
      trainingSessionId?: string;
      target: PlatformSenseCardTargetV2 & {
        activeKnownMarkId: string;
        knownMarkRevision: string;
      };
      sourceContext?: PlatformSourceContextV2;
    }
  | {
      actionId: "review-card";
      clientEventId: string;
      trainingSessionId?: string;
      target: PlatformSenseCardTargetV2;
      reviewResult: "fail" | "hard" | "success" | "easy";
      sourceContext?: PlatformSourceContextV2;
    }
  | {
      actionId: "review-exercise";
      clientEventId: string;
      trainingSessionId: string;
      target: PlatformTrainingExerciseTargetV2;
      reviewResult: PlatformTrainingExerciseReviewResultV2;
      sourceContext?: PlatformSourceContextV2;
    };

export type PlatformOrdinaryActionId =
  | "start-learning"
  | "mark-known"
  | "undo-known"
  | "review-card";

export type PlatformOrdinaryActionRequest = Exclude<
  PlatformActionV2Request,
  { actionId: "review-exercise" }
>;

export type PlatformActionV2Response = {
  contractVersion: "platform-action-v2";
  actionId: PlatformOrdinaryActionId;
  clientEventId: string;
  accepted: boolean;
  card: PlatformSenseCardStateV2;
};

export type PlatformIdiomExerciseActionResponseV2 = {
  contractVersion: "platform-action-v2";
  actionId: "review-exercise";
  clientEventId: string;
  accepted: true;
  exercise: {
    targetId: string;
    targetKey: string;
    family: "idiom";
    direction: PlatformTrainingExerciseDirectionV2;
    state: PlatformTrainingExerciseStateV2;
  };
};

export type PlatformTranslationExerciseActionResponseV2 = {
  contractVersion: "platform-action-v2";
  actionId: "review-exercise";
  clientEventId: string;
  accepted: true;
  exercise: {
    targetId: string;
    targetKey: string;
    family: "translation";
    direction: "recall";
    state: PlatformTrainingExerciseStateV2;
  };
};

export type PlatformGeneratedDraftV2Response = {
  contractVersion: "platform-generated-draft-v2";
  draftSetId: string;
  candidate: {
    candidateId: string;
    revision: number;
    draftGroupId: string;
    header: PlatformHeadwordHeaderV2;
    contentNodes: Array<
      Omit<PlatformContentNodeV2, "contentNodeId" | "parentContentNodeId"> & {
        draftContentNodeId: string;
        parentDraftContentNodeId: string | null;
      }
    >;
  };
  capabilities: Array<{
    actionId: "save-generated-draft";
    elementId: string;
    messageKey: string;
    target: {
      kind: "generated-draft";
      draftSetId: string;
      candidateId: string;
      revision: number;
    };
  }>;
};


/** Scenario-owned counts, consumed by the common Training footer. */
export type PlatformTrainingExerciseStatsV1 = {
  contractVersion: "training-idiom-stats-v1";
  newCardsToday: number;
  reviewCardsDone: number;
  reviewCardsDue: number;
  totalCardsStarted: number;
  totalCardsInScope: number;
};
