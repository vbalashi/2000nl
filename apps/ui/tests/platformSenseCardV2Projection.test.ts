import { describe, expect, test } from "vitest";
import { projectPlatformLookupV2 } from "@/lib/platform/projections/senseCardV2";

describe("Platform V2 SenseCard projection", () => {
  test("projects one persisted meaning through explicit group and Content Node identity", () => {
    const response = projectPlatformLookupV2({
      query: "huis",
      request: {
        contentLanguageCode: "nl",
        translationTargetLanguageCode: "ru",
        cardTypeId: "word-to-definition",
        intent: "external-click",
      },
      page: {
        selectedTierComplete: true,
        nextGroupCursor: null,
      },
      entries: [
        {
          headwordGroupId: "group-1",
          entry: {
            id: "entry-1",
            dictionaryId: "dict-1",
            languageCode: "nl",
            headword: "huis",
            meaningId: 1,
            partOfSpeech: "zn",
            gender: "het",
            contentFingerprint: "content-revision-1",
            isNt22000: true,
            meaningsCount: 1,
            raw: {
              providerOnly: "must-not-leak",
            },
            content: {
              headword: "huis",
              languageCode: "nl",
              meaningId: 1,
              partOfSpeech: "zn",
              gender: "het",
              meanings: [
                {
                  definition: "een gebouw om in te wonen",
                  examples: ["dit is mijn huis"],
                },
              ],
              summary: {
                definition: "een gebouw om in te wonen",
                example: "dit is mijn huis",
              },
              sections: [
                {
                  id: "meaning-1",
                  sourcePath: "raw.meanings[0].definition",
                  kind: "meaning",
                  text: "een gebouw om in te wonen",
                },
                {
                  id: "example-1-1",
                  sourcePath: "raw.meanings[0].examples[0]",
                  kind: "example",
                  text: "dit is mijn huis",
                },
              ],
            },
          },
          dictionary: {
            id: "dict-1",
            languageCode: "nl",
            slug: "nl-vandale",
            name: "Van Dale",
            kind: "curated",
            visibility: "system",
          },
          contentNodeBindings: [
            {
              contentNodeId: "node-definition-1",
              sourcePath: "raw.meanings[0].definition",
              kind: "definition",
              sourceTextFingerprint: "definition-fingerprint-1",
            },
            {
              contentNodeId: "node-example-1",
              sourcePath: "raw.meanings[0].examples[0]",
              kind: "example",
              sourceTextFingerprint: "example-fingerprint-1",
            },
          ],
          cardState: {
            stateRevision: "state-revision-1",
            clickCount: 2,
            seenCount: 3,
            successCount: 1,
            lastSeenAt: "2026-07-20T10:00:00.000Z",
            lastReviewedAt: null,
            nextReviewAt: null,
            hidden: false,
            frozenUntil: null,
            inLearning: true,
            learningDueAt: "2026-07-20T11:00:00.000Z",
            fsrs: {
              stability: null,
              difficulty: null,
              reps: 0,
              lapses: 0,
              lastGrade: null,
              lastInterval: null,
              paramsVersion: null,
            },
          },
        },
      ],
    });

    expect(response).toEqual({
      contractVersion: "platform-lookup-v2",
      query: "huis",
      request: {
        contentLanguageCode: "nl",
        translationTargetLanguageCode: "ru",
        cardTypeId: "word-to-definition",
        intent: "external-click",
      },
      groups: [
        {
          headwordGroupId: "group-1",
          dictionary: {
            dictionaryId: "dict-1",
            sourceLanguageCode: "nl",
            messageKey: "dictionary.nl-vandale",
          },
          header: {
            text: "huis",
            article: "het",
            partOfSpeech: {
              termId: "part-of-speech.zn",
              messageKey: "partOfSpeech.zn",
              sourceValue: "zn",
            },
          },
          senseCount: 1,
          entryCount: 1,
          indicators: [
            {
              indicatorId: "core-vocabulary",
              value: "nt2-2000",
              messageKey: "indicator.coreVocabulary.nt22000",
            },
          ],
          entries: [
            {
              kind: "sense-card",
              entryId: "entry-1",
              meaningOrdinal: 1,
              partOfSpeech: {
                termId: "part-of-speech.zn",
                messageKey: "partOfSpeech.zn",
                sourceValue: "zn",
              },
              card: {
                cardTypeId: "word-to-definition",
                scheduler: {
                  phase: "learning",
                  repeatCount: 2,
                  lastSeenAt: "2026-07-20T10:00:00.000Z",
                },
                knownMark: null,
                stateRevision: "state-revision-1",
              },
              contentRevision: "content-revision-1",
              summaryContentNodeId: "node-definition-1",
              contentNodes: [
                {
                  contentNodeId: "node-definition-1",
                  parentContentNodeId: null,
                  kind: "definition",
                  order: 0,
                  text: "een gebouw om in te wonen",
                  sourceTextFingerprint: "definition-fingerprint-1",
                  translations: [],
                },
                {
                  contentNodeId: "node-example-1",
                  parentContentNodeId: null,
                  kind: "example",
                  order: 1,
                  text: "dit is mijn huis",
                  sourceTextFingerprint: "example-fingerprint-1",
                  translations: [],
                },
              ],
              translation: null,
              capabilities: [
                {
                  actionId: "review-card",
                  elementId: "sense-card.review.fail",
                  messageKey: "senseCard.review.fail",
                  target: {
                    kind: "sense-card",
                    entryId: "entry-1",
                    cardTypeId: "word-to-definition",
                    stateRevision: "state-revision-1",
                  },
                  reviewResult: "fail",
                },
                {
                  actionId: "review-card",
                  elementId: "sense-card.review.hard",
                  messageKey: "senseCard.review.hard",
                  target: {
                    kind: "sense-card",
                    entryId: "entry-1",
                    cardTypeId: "word-to-definition",
                    stateRevision: "state-revision-1",
                  },
                  reviewResult: "hard",
                },
                {
                  actionId: "review-card",
                  elementId: "sense-card.review.success",
                  messageKey: "senseCard.review.success",
                  target: {
                    kind: "sense-card",
                    entryId: "entry-1",
                    cardTypeId: "word-to-definition",
                    stateRevision: "state-revision-1",
                  },
                  reviewResult: "success",
                },
                {
                  actionId: "review-card",
                  elementId: "sense-card.review.easy",
                  messageKey: "senseCard.review.easy",
                  target: {
                    kind: "sense-card",
                    entryId: "entry-1",
                    cardTypeId: "word-to-definition",
                    stateRevision: "state-revision-1",
                  },
                  reviewResult: "easy",
                },
                {
                  actionId: "request-translation",
                  elementId: "sense-card.translation.request",
                  messageKey: "senseCard.translation.request",
                  target: {
                    kind: "entry",
                    entryId: "entry-1",
                    contentRevision: "content-revision-1",
                  },
                  targetLanguageCode: "ru",
                },
                {
                  actionId: "report-content",
                  elementId: "sense-card.report",
                  messageKey: "senseCard.report",
                  target: {
                    kind: "entry",
                    entryId: "entry-1",
                    contentRevision: "content-revision-1",
                  },
                },
                {
                  actionId: "report-content",
                  elementId: "sense-card.report.content-node",
                  messageKey: "senseCard.report",
                  target: {
                    kind: "content-node",
                    entryId: "entry-1",
                    contentNodeId: "node-definition-1",
                    sourceTextFingerprint: "definition-fingerprint-1",
                  },
                },
                {
                  actionId: "report-content",
                  elementId: "sense-card.report.content-node",
                  messageKey: "senseCard.report",
                  target: {
                    kind: "content-node",
                    entryId: "entry-1",
                    contentNodeId: "node-example-1",
                    sourceTextFingerprint: "example-fingerprint-1",
                  },
                },
              ],
            },
          ],
        },
      ],
      page: {
        selectedTierComplete: true,
        nextGroupCursor: null,
      },
    });

    expect(JSON.stringify(response)).not.toContain("providerOnly");
    expect(JSON.stringify(response)).not.toContain("sourcePath");
    expect(JSON.stringify(response)).not.toContain("mark-known");
    expect(JSON.stringify(response)).not.toContain("undo-known");
  });
});
