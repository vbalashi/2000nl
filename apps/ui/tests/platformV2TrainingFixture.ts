import type {
  PlatformHeadwordGroupV2,
  PlatformSenseCardEntryV2,
} from "../../../packages/shared/types/platformV2";

export const singleSenseEntry: PlatformSenseCardEntryV2 = {
  kind: "sense-card",
  entryId: "entry-hand-1",
  meaningOrdinal: 1,
  partOfSpeech: {
    termId: "part-of-speech.zn",
    messageKey: "partOfSpeech.zn",
    sourceValue: "zn",
  },
  card: {
    cardTypeId: "word-to-definition",
    scheduler: { phase: "learning", repeatCount: 3 },
    knownMark: null,
    stateRevision: "state-1",
  },
  contentRevision: "content-1",
  reportContentRevision: null,
  summaryContentNodeId: "definition-1",
  contentNodes: [
    {
      contentNodeId: "definition-1",
      parentContentNodeId: null,
      kind: "definition",
      order: 0,
      text: "het einde van je arm, waar je vingers aan zitten",
      sourceTextFingerprint: "definition-fingerprint",
      translations: [
        {
          translationId: "definition-translation",
          targetLanguageCode: "en",
          status: "ready",
          text: "the end of your arm, where your fingers are attached",
          sourceTextFingerprint: "definition-fingerprint",
          translationPolicyVersion: "policy-1",
        },
      ],
    },
    {
      contentNodeId: "example-1",
      parentContentNodeId: null,
      kind: "example",
      order: 1,
      text: "Ze hield de brief stevig in haar hand.",
      sourceTextFingerprint: "example-fingerprint",
      translations: [
        {
          translationId: "example-translation",
          targetLanguageCode: "en",
          status: "ready",
          text: "She held the letter firmly in her hand.",
          sourceTextFingerprint: "example-fingerprint",
          translationPolicyVersion: "policy-1",
        },
      ],
    },
  ],
  translation: {
    translationId: "entry-translation",
    entryId: "entry-hand-1",
    targetLanguageCode: "en",
    status: "ready",
    text: "hand",
    sourceContentFingerprint: "content-fingerprint",
    translationPolicyVersion: "policy-1",
    isFresh: true,
  },
  capabilities: [
    {
      actionId: "mark-known",
      elementId: "sense-card.known.mark",
      messageKey: "senseCard.known.mark",
      target: {
        kind: "sense-card",
        entryId: "entry-hand-1",
        cardTypeId: "word-to-definition",
        stateRevision: "state-1",
      },
    },
    ...(["fail", "hard", "success", "easy"] as const).map(
      (reviewResult) => ({
        actionId: "review-card" as const,
        elementId: `sense-card.review.${reviewResult}`,
        messageKey: `senseCard.review.${reviewResult}`,
        target: {
          kind: "sense-card" as const,
          entryId: "entry-hand-1",
          cardTypeId: "word-to-definition" as const,
          stateRevision: "state-1",
        },
        reviewResult,
      }),
    ),
  ],
};

export const singleSenseGroup: PlatformHeadwordGroupV2 = {
  headwordGroupId: "group-hand",
  dictionary: {
    dictionaryId: "vandale",
    sourceLanguageCode: "nl",
    displayName: "Van Dale",
    messageKey: "dictionary.name",
  },
  header: {
    text: "hand",
    displayPronunciation: "hand",
    article: "de",
    partOfSpeech: singleSenseEntry.partOfSpeech,
    audio: {
      audioId: "audio-hand",
      actionId: "play-audio",
      contentLanguageCode: "nl",
    },
  },
  senseCount: 1,
  entryCount: 1,
  indicators: [
    {
      indicatorId: "core-vocabulary.nt2-2000",
      value: "true",
      messageKey: "indicator.coreVocabulary.nt22000",
    },
  ],
  entries: [singleSenseEntry],
};
