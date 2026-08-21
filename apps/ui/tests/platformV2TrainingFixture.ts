import type {
  PlatformHeadwordGroupV2,
  PlatformSenseCardEntryV2,
} from "../../../packages/shared/types/platformV2";
import { projectPlatformLookupV2 } from "@/lib/platform/projections/senseCardV2";

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

export function projectedTrainingAudioResult(
  mode: "word-to-definition" | "definition-to-word",
  withAudio: boolean,
) {
  const languageCode = withAudio ? "nl" : "en";
  const definition = singleSenseEntry.contentNodes[0];
  const sourcePath = "raw.meanings[0].definition";
  const payload = projectPlatformLookupV2({
    query: singleSenseGroup.header.text,
    request: {
      contentLanguageCode: languageCode,
      translationTargetLanguageCode: withAudio ? "en" : "nl",
      cardTypeId: mode,
      intent: "training-review",
    },
    page: { selectedTierComplete: true, nextGroupCursor: null },
    entries: [
      {
        headwordGroupId: singleSenseGroup.headwordGroupId,
        entry: {
          id: singleSenseEntry.entryId,
          dictionaryId: singleSenseGroup.dictionary.dictionaryId,
          languageCode,
          headword: singleSenseGroup.header.text,
          meaningId: singleSenseEntry.meaningOrdinal,
          partOfSpeech: singleSenseEntry.partOfSpeech?.sourceValue,
          gender: singleSenseGroup.header.article,
          contentFingerprint: singleSenseEntry.contentRevision,
          raw: {},
          content: {
            headword: singleSenseGroup.header.text,
            languageCode,
            meaningId: singleSenseEntry.meaningOrdinal,
            partOfSpeech: singleSenseEntry.partOfSpeech?.sourceValue,
            gender: singleSenseGroup.header.article,
            meanings: [{ definition: definition.text }],
            summary: { definition: definition.text },
            sections: [
              {
                id: definition.contentNodeId,
                sourcePath,
                kind: "meaning",
                text: definition.text,
              },
            ],
          },
        },
        dictionary: {
          id: singleSenseGroup.dictionary.dictionaryId,
          languageCode,
          slug: "vandale",
          name: singleSenseGroup.dictionary.displayName,
          kind: "curated",
          visibility: "system",
        },
        contentNodeBindings: [
          {
            contentNodeId: definition.contentNodeId,
            sourcePath,
            kind: "definition",
            sourceTextFingerprint: definition.sourceTextFingerprint,
          },
        ],
        ...(withAudio ? { audioCapability: singleSenseGroup.header.audio } : {}),
      },
    ],
  });
  const group = payload.groups[0];
  const entry = group.entries[0];
  if (!entry || entry.kind !== "sense-card") {
    throw new Error("Expected projected Training SenseCard");
  }
  return { state: "ready" as const, group, entry };
}
