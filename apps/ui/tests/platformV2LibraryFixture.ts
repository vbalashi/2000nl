import type {
  PlatformHeadwordGroupV2,
  PlatformSenseCardEntryV2,
} from "../../../packages/shared/types/platformV2";

const makeEntry = (input: {
  entryId: string;
  ordinal: number;
  definition: string;
  translation: string;
  phase: "not-started" | "reviewing";
  repeatCount: number;
}): PlatformSenseCardEntryV2 => ({
  kind: "sense-card",
  entryId: input.entryId,
  meaningOrdinal: input.ordinal,
  partOfSpeech: {
    termId: "part-of-speech.zn",
    messageKey: "partOfSpeech.zn",
    sourceValue: "zn",
  },
  card: {
    cardTypeId: "word-to-definition",
    scheduler: {
      phase: input.phase,
      repeatCount: input.repeatCount,
    },
    knownMark: null,
    stateRevision: `state-${input.entryId}`,
  },
  contentRevision: `content-${input.entryId}`,
  summaryContentNodeId: `definition-${input.entryId}`,
  contentNodes: [
    {
      contentNodeId: `definition-${input.entryId}`,
      parentContentNodeId: null,
      kind: "definition",
      order: 0,
      text: input.definition,
      sourceTextFingerprint: `fingerprint-${input.entryId}`,
      translations: [],
    },
    {
      contentNodeId: `example-${input.entryId}`,
      parentContentNodeId: null,
      kind: "example",
      order: 1,
      text:
        input.entryId === "entry-bank-furniture"
          ? "Margriet en Ellie zaten op de bank televisie te kijken."
          : "Bij welke bank hebt u een rekening?",
      sourceTextFingerprint: `example-fingerprint-${input.entryId}`,
      translations: [],
    },
  ],
  translation: {
    translationId: `translation-${input.entryId}`,
    entryId: input.entryId,
    targetLanguageCode: "en",
    status: "ready",
    text: input.translation,
    sourceContentFingerprint: `content-${input.entryId}`,
    translationPolicyVersion: "policy-1",
    isFresh: true,
  },
  capabilities:
    input.phase === "not-started"
      ? [
          {
            actionId: "start-learning",
            elementId: "sense-card.learning.start",
            messageKey: "senseCard.learning.start",
            target: {
              kind: "sense-card",
              entryId: input.entryId,
              cardTypeId: "word-to-definition",
              stateRevision: `state-${input.entryId}`,
            },
          },
          {
            actionId: "mark-known",
            elementId: "sense-card.known.mark",
            messageKey: "senseCard.known.mark",
            target: {
              kind: "sense-card",
              entryId: input.entryId,
              cardTypeId: "word-to-definition",
              stateRevision: `state-${input.entryId}`,
            },
          },
        ]
      : (["fail", "hard", "success", "easy"] as const).map(
          (reviewResult) => ({
            actionId: "review-card" as const,
            elementId: `sense-card.review.${reviewResult}`,
            messageKey: `senseCard.review.${reviewResult}`,
            target: {
              kind: "sense-card" as const,
              entryId: input.entryId,
              cardTypeId: "word-to-definition",
              stateRevision: `state-${input.entryId}`,
            },
            reviewResult,
          }),
        ),
});

export const furnitureEntry = makeEntry({
  entryId: "entry-bank-furniture",
  ordinal: 1,
  definition: "een meubelstuk waarop je met meer personen kunt zitten",
  translation: "bench · sofa",
  phase: "reviewing",
  repeatCount: 3,
});

export const financeEntry = makeEntry({
  entryId: "entry-bank-finance",
  ordinal: 2,
  definition: "een bedrijf dat jouw geld bewaart of waar je geld kunt lenen",
  translation: "bank · financial institution",
  phase: "not-started",
  repeatCount: 0,
});

export const multiSenseBankGroup: PlatformHeadwordGroupV2 = {
  headwordGroupId: "group-bank",
  dictionary: {
    dictionaryId: "vandale",
    sourceLanguageCode: "nl",
    displayName: "Van Dale",
    messageKey: "dictionary.name",
  },
  header: {
    text: "bank",
    displayPronunciation: "bank",
    article: "de",
    partOfSpeech: furnitureEntry.partOfSpeech,
  },
  senseCount: 2,
  entryCount: 2,
  indicators: [
    {
      indicatorId: "core-vocabulary",
      value: "nt2-2000",
      messageKey: "indicator.coreVocabulary.nt22000",
    },
  ],
  entries: [furnitureEntry, financeEntry],
};
