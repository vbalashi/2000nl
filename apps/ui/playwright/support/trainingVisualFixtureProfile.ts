import type {
  PlatformContentNodeV2,
  PlatformHeadwordGroupV2,
  PlatformSenseCardCapabilityV2,
  PlatformSenseCardTargetV2,
} from "../../../../packages/shared/types/platformV2";

export const trainingVisualStates = [
  "face",
  "answer",
  "long-idiom",
  "recoverable-error",
] as const;

export type TrainingVisualState = (typeof trainingVisualStates)[number];

type FixtureEntry = {
  id: string;
};

export function buildTrainingVisualFixtureProfile(state: TrainingVisualState) {
  const long = state === "long-idiom";
  return {
    state,
    interfaceLanguage: "nl" as const,
    translationTargetLanguageCode: "en" as const,
    headword: long ? "nodig" : "bank",
    partOfSpeech: long ? "bn." : "zn.",
    invalid: state === "recoverable-error",
    entryTranslation: {
      targetLanguageCode: "en" as const,
      text: long ? "necessary" : "bench · sofa",
    },
    definitionTranslation: {
      targetLanguageCode: "en" as const,
      text: long
        ? "required or desired for a particular purpose"
        : "a piece of furniture that seats several people",
    },
  };
}

export function buildTrainingVisualLookupGroup(
  entry: FixtureEntry,
  state: TrainingVisualState,
): PlatformHeadwordGroupV2 {
  const profile = buildTrainingVisualFixtureProfile(state);
  const target: PlatformSenseCardTargetV2 = {
    kind: "sense-card" as const,
    entryId: entry.id,
    cardTypeId: "word-to-definition" as const,
    stateRevision: `state-${entry.id}`,
  };
  const capabilities: PlatformSenseCardCapabilityV2[] = (["fail", "hard", "success", "easy"] as const).map(
    (reviewResult) => ({
      actionId: "review-card" as const,
      elementId: `sense-card.review.${reviewResult}`,
      messageKey: `senseCard.review.${reviewResult}`,
      target,
      reviewResult,
    }),
  );
  capabilities.push(
    {
      actionId: "mark-known",
      elementId: "sense-card.known.mark",
      messageKey: "senseCard.known.mark",
      target,
    },
    {
      actionId: "report-content",
      elementId: "sense-card.report",
      messageKey: "senseCard.report",
      target: { kind: "entry", entryId: entry.id, contentRevision: `content-${entry.id}` },
    },
  );
  const contentNodes: PlatformContentNodeV2[] = [
    {
      contentNodeId: `definition-${entry.id}`,
      parentContentNodeId: null,
      kind: "definition",
      order: 0,
      text: profile.state === "long-idiom"
        ? "vereist of gewenst voor een bepaald doel"
        : "een meubelstuk waarop je met meer personen kunt zitten",
      sourceTextFingerprint: `fingerprint-${entry.id}`,
      translations: [{
        translationId: `definition-translation-${entry.id}`,
        ...profile.definitionTranslation,
        status: "ready",
        sourceTextFingerprint: `fingerprint-${entry.id}`,
        translationPolicyVersion: "attribution-fixture-v1",
      }],
    },
    ...(profile.state === "long-idiom"
      ? [
          ...idiomNodes(entry.id, 1, "iets nodig hebben", "iets moeten gebruiken of bezitten", "ik heb je hulp nodig"),
          ...idiomNodes(entry.id, 2, "zo nodig", "als het noodzakelijk is", "bel mij zo nodig"),
        ]
      : [{
          contentNodeId: `example-${entry.id}`,
          parentContentNodeId: null,
          kind: "example" as const,
          order: 1,
          text: "Margriet en Ellie zaten op de bank televisie te kijken.",
          sourceTextFingerprint: `example-fingerprint-${entry.id}`,
          translations: [],
        }]),
  ];

  return {
    headwordGroupId: `group-${entry.id}`,
    dictionary: {
      dictionaryId: "fixture-dictionary",
      sourceLanguageCode: "nl",
      displayName: "Attribution dictionary",
      messageKey: "dictionary.source",
    },
    header: {
      text: profile.invalid ? "" : profile.headword,
      article: "de",
      partOfSpeech: {
        termId: `part-of-speech.${profile.partOfSpeech.replace(".", "")}`,
        messageKey: profile.partOfSpeech === "bn." ? "partOfSpeech.bn" : "partOfSpeech.zn",
        sourceValue: profile.partOfSpeech,
      },
      audio: {
        audioId: `audio-${entry.id}`,
        actionId: "play-audio",
        contentLanguageCode: "nl",
      },
    },
    senseCount: 1,
    entryCount: 1,
    indicators: [{
      indicatorId: "core-vocabulary.nt2-2000",
      value: "true",
      messageKey: "indicator.coreVocabulary.nt22000",
    }],
    entries: [{
      kind: "sense-card",
      entryId: entry.id,
      meaningOrdinal: 1,
      partOfSpeech: {
        termId: `part-of-speech.${profile.partOfSpeech.replace(".", "")}`,
        messageKey: profile.partOfSpeech === "bn." ? "partOfSpeech.bn" : "partOfSpeech.zn",
        sourceValue: profile.partOfSpeech,
      },
      card: {
        cardTypeId: "word-to-definition",
        scheduler: { phase: "learning", repeatCount: 1 },
        knownMark: null,
        stateRevision: `state-${entry.id}`,
      },
      contentRevision: `content-${entry.id}`,
      reportContentRevision: `content-${entry.id}`,
      summaryContentNodeId: `definition-${entry.id}`,
      contentNodes,
      translation: {
        translationId: `translation-${entry.id}`,
        entryId: entry.id,
        ...profile.entryTranslation,
        status: "ready",
        sourceContentFingerprint: `content-${entry.id}`,
        translationPolicyVersion: "attribution-fixture-v1",
        isFresh: true,
      },
      capabilities,
    }],
  };
}

function idiomNodes(
  entryId: string,
  ordinal: number,
  text: string,
  definition: string,
  example: string,
): PlatformContentNodeV2[] {
  const parentId = `idiom-${ordinal}-${entryId}`;
  return [
    { contentNodeId: parentId, parentContentNodeId: null, kind: "idiom", order: ordinal * 10, text, sourceTextFingerprint: `${parentId}-fingerprint`, translations: [] },
    { contentNodeId: `${parentId}-definition`, parentContentNodeId: parentId, kind: "definition", order: ordinal * 10 + 1, text: definition, sourceTextFingerprint: `${parentId}-definition-fingerprint`, translations: [] },
    { contentNodeId: `${parentId}-example`, parentContentNodeId: parentId, kind: "example", order: ordinal * 10 + 2, text: example, sourceTextFingerprint: `${parentId}-example-fingerprint`, translations: [] },
  ];
}
