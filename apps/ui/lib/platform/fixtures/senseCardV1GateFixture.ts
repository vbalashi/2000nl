import type {
  PlatformHeadwordGroupV2,
  PlatformSenseCardEntryV2,
} from "../../../../../packages/shared/types/platformV2";

function makeContentNode(
  entryId: string,
  kind: "definition" | "example",
  order: number,
  text: string,
  translation: string,
) {
  const contentNodeId = `${kind}-${entryId}`;
  const sourceTextFingerprint = `fingerprint-${contentNodeId}`;
  return {
    contentNodeId,
    parentContentNodeId: null,
    kind,
    order,
    text,
    sourceTextFingerprint,
    translations: [
      {
        translationId: `translation-${contentNodeId}`,
        targetLanguageCode: "ru",
        status: "ready" as const,
        text: translation,
        sourceTextFingerprint,
        translationPolicyVersion: "cross-product-gate-v1",
      },
    ],
  };
}

function makeEntry(input: {
  entryId: string;
  ordinal: number;
  definition: string;
  definitionTranslation: string;
  example: string;
  exampleTranslation: string;
  entryTranslation: string;
  phase: "not-started" | "reviewing";
  repeatCount: number;
}): PlatformSenseCardEntryV2 {
  const target = {
    kind: "sense-card" as const,
    entryId: input.entryId,
    cardTypeId: "word-to-definition" as const,
    stateRevision: `state-${input.entryId}`,
  };
  const definition = makeContentNode(
    input.entryId,
    "definition",
    0,
    input.definition,
    input.definitionTranslation,
  );
  return {
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
      stateRevision: target.stateRevision,
    },
    contentRevision: `content-${input.entryId}`,
    summaryContentNodeId: definition.contentNodeId,
    contentNodes: [
      definition,
      makeContentNode(
        input.entryId,
        "example",
        1,
        input.example,
        input.exampleTranslation,
      ),
    ],
    translation: {
      translationId: `translation-${input.entryId}`,
      entryId: input.entryId,
      targetLanguageCode: "ru",
      status: "ready",
      text: input.entryTranslation,
      sourceContentFingerprint: `content-${input.entryId}`,
      translationPolicyVersion: "cross-product-gate-v1",
      isFresh: true,
    },
    capabilities:
      input.phase === "not-started"
        ? [
            {
              actionId: "start-learning",
              elementId: "sense-card.learning.start",
              messageKey: "senseCard.learning.start",
              target,
            },
            {
              actionId: "mark-known",
              elementId: "sense-card.known.mark",
              messageKey: "senseCard.known.mark",
              target,
            },
          ]
        : (["fail", "hard", "success", "easy"] as const).map(
            (reviewResult) => ({
              actionId: "review-card" as const,
              elementId: `sense-card.review.${reviewResult}`,
              messageKey: `senseCard.review.${reviewResult}`,
              target,
              reviewResult,
            }),
          ),
  };
}

export const gateFurnitureEntry = makeEntry({
  entryId: "entry-bank-furniture",
  ordinal: 1,
  definition: "een meubelstuk waarop je met meer personen kunt zitten",
  definitionTranslation:
    "предмет мебели, на котором могут сидеть несколько человек",
  example: "Margriet en Ellie zaten op de bank televisie te kijken.",
  exampleTranslation:
    "Маргрит и Элли сидели на диване и смотрели телевизор.",
  entryTranslation: "скамья · диван",
  phase: "reviewing",
  repeatCount: 3,
});

export const gateFinanceEntry = makeEntry({
  entryId: "entry-bank-finance",
  ordinal: 2,
  definition: "een bedrijf dat geld bewaart, leent en betalingen regelt",
  definitionTranslation:
    "организация, которая хранит деньги, выдаёт кредиты и проводит платежи",
  example: "Bij welke bank hebt u een rekening?",
  exampleTranslation: "В каком банке у вас открыт счёт?",
  entryTranslation: "банк · финансовое учреждение",
  phase: "not-started",
  repeatCount: 0,
});

export const gateBankGroup: PlatformHeadwordGroupV2 = {
  headwordGroupId: "headword-bank",
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
    partOfSpeech: gateFurnitureEntry.partOfSpeech,
    audio: {
      audioId: "audio-bank",
      actionId: "play-audio",
      contentLanguageCode: "nl",
    },
  },
  senseCount: 2,
  entryCount: 2,
  indicators: [
    {
      indicatorId: "core-vocabulary",
      value: "2K",
      messageKey: "indicator.coreVocabulary.nt22000",
    },
  ],
  entries: [gateFurnitureEntry, gateFinanceEntry],
};

export const gateSingleSenseGroup: PlatformHeadwordGroupV2 = {
  ...gateBankGroup,
  senseCount: 1,
  entryCount: 1,
  entries: [gateFurnitureEntry],
};

export const gateLongHeadwordGroup: PlatformHeadwordGroupV2 = {
  ...gateSingleSenseGroup,
  headwordGroupId: "headword-long-compound",
  header: {
    ...gateSingleSenseGroup.header,
    text: "arbeidsongeschiktheidsverzekering",
    displayPronunciation: "ar·beids·on·ge·schikt·heids·ver·ze·ke·ring",
  },
};
