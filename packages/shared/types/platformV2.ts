import type { CardTypeId, LookupIntent, PlatformSourceContextV2 } from "./platform";

export type PlatformSemanticTermV2 = {
  termId: string;
  messageKey: string;
  sourceValue?: string;
};

export type PlatformDictionarySummaryV2 = {
  dictionaryId: string;
  sourceLanguageCode: string;
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

export type PlatformTranslationTargetV2 = {
  kind: "translation";
  entryId: string;
  translationId: string;
  contentNodeId?: string;
  sourceTextFingerprint: string;
};

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
  summaryContentNodeId: string | null;
  contentNodes: PlatformContentNodeV2[];
  translation: PlatformEntryTranslationStateV2 | null;
  capabilities: PlatformSenseCardCapabilityV2[];
  wordDetails?: PlatformWordDetailsV2;
};

export type PlatformCrossReferenceEntryV2 = {
  kind: "cross-reference";
  crossReferenceId: string;
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

export type PlatformLookupV2Request = {
  query: string;
  contentLanguageCode?: string | null;
  translationTargetLanguageCode?: string | null;
  cardTypeId: CardTypeId;
  intent?: LookupIntent;
  cursor?: string | null;
};

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
      target: PlatformSenseCardTargetV2;
      sourceContext?: PlatformSourceContextV2;
    }
  | {
      actionId: "undo-known";
      clientEventId: string;
      target: PlatformSenseCardTargetV2 & {
        activeKnownMarkId: string;
        knownMarkRevision: string;
      };
      sourceContext?: PlatformSourceContextV2;
    }
  | {
      actionId: "review-card";
      clientEventId: string;
      target: PlatformSenseCardTargetV2;
      reviewResult: "fail" | "hard" | "success" | "easy";
      sourceContext?: PlatformSourceContextV2;
    };

export type PlatformActionV2Response = {
  contractVersion: "platform-action-v2";
  actionId: PlatformActionV2Request["actionId"];
  clientEventId: string;
  accepted: boolean;
  card: PlatformSenseCardStateV2;
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
