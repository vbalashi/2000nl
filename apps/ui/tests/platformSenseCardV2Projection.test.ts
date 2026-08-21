import { describe, expect, test } from "vitest";
import { projectPlatformLookupV2 } from "@/lib/platform/projections/senseCardV2";
import { goedEntry } from "./platformV2IdiomHierarchyFixture";

describe("Platform V2 SenseCard projection", () => {
  test("preserves the goed parent identities when bindings arrive reordered", () => {
    const input = projectionInput({
      stateRevision: "state-goed-hierarchy",
      knownMark: null,
    });
    input.query = "goed";
    input.entries[0].entry = {
      ...input.entries[0].entry,
      id: goedEntry.entryId,
      headword: "goed",
      contentFingerprint: goedEntry.contentRevision,
    };
    input.entries[0].contentSections = [...goedEntry.contentNodes]
      .sort((left, right) => left.order - right.order)
      .map((item) => ({
        sourcePath: `fixture.${item.contentNodeId}`,
        kind: item.kind,
        text: item.text,
      }));
    input.entries[0].contentNodeBindings = goedEntry.contentNodes.map((item) => ({
      contentNodeId: item.contentNodeId,
      sourcePath: `fixture.${item.contentNodeId}`,
      kind: item.kind,
      parentContentNodeId: item.parentContentNodeId,
      sourceTextFingerprint: item.sourceTextFingerprint,
    }));
    input.entries[0].allowMutationCapabilities = true;

    const senseCard = projectPlatformLookupV2(input).groups[0].entries[0];
    expect(senseCard.kind).toBe("sense-card");
    if (senseCard.kind !== "sense-card") throw new Error("Expected SenseCard");
    expect(
      senseCard.contentNodes.filter((item) => item.parentContentNodeId === "idiom-goed"),
    ).toEqual([
      expect.objectContaining({
        contentNodeId: "idiom-explanation-goed",
        kind: "idiom-explanation",
      }),
      expect.objectContaining({
        contentNodeId: "idiom-example-goed",
        kind: "example",
      }),
    ]);
    expect(
      senseCard.capabilities
        .filter(
          (capability) =>
            capability.actionId === "report-content" &&
            capability.target.kind === "content-node",
        )
        .map((capability) =>
          capability.target.kind === "content-node"
            ? capability.target.contentNodeId
            : null,
        ),
    ).toEqual(
      expect.arrayContaining([
        "idiom-goed",
        "idiom-explanation-goed",
        "idiom-example-goed",
      ]),
    );
  });
  test("publishes verified group audio and a request-translation capability", () => {
    const input = projectionInput({
      stateRevision: "state-translation",
      knownMark: null,
    });
    input.request.translationTargetLanguageCode = "en";
    input.entries[0].audioCapability = {
      audioId: "entry-known:headword:nl",
      actionId: "play-audio",
      contentLanguageCode: "nl",
    };
    input.entries[0].allowMutationCapabilities = true;

    const response = projectPlatformLookupV2(input);
    expect(response.groups[0].header.audio).toEqual({
      audioId: "entry-known:headword:nl",
      actionId: "play-audio",
      contentLanguageCode: "nl",
    });
    expect(response.groups[0].entries[0]).toEqual(
      expect.objectContaining({
        capabilities: expect.arrayContaining([
          expect.objectContaining({
            actionId: "request-translation",
            targetLanguageCode: "en",
          }),
        ]),
      }),
    );
  });

  test("keeps headword audio on a multi-sense group", () => {
    const input = projectionInput({
      stateRevision: "state-multi-sense-audio",
      knownMark: null,
    });
    input.entries[0].audioCapability = {
      audioId: "group-known:headword:nl",
      actionId: "play-audio",
      contentLanguageCode: "nl",
    };
    input.entries.push({
      ...input.entries[0],
      entry: {
        ...input.entries[0].entry,
        id: "entry-known-2",
        meaningId: 2,
      },
      contentNodeBindings: input.entries[0].contentNodeBindings.map((binding) => ({
        ...binding,
        contentNodeId: `${binding.contentNodeId}-2`,
      })),
    });

    expect(projectPlatformLookupV2(input).groups[0].header.audio).toEqual(
      input.entries[0].audioCapability,
    );
  });

  test("offers Start Learning and Mark Known for an untracked card", () => {
    const response = projectPlatformLookupV2(
      projectionInput({
        stateRevision: "untracked",
        knownMark: null,
      }),
    );

    const senseCard = response.groups[0].entries[0];
    expect(senseCard.kind).toBe("sense-card");
    expect(senseCard.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionId: "start-learning" }),
        expect.objectContaining({ actionId: "mark-known" }),
      ]),
    );
  });

  test("projects an active Known Mark and offers only its exact Undo mutation", () => {
    const response = projectPlatformLookupV2(
      projectionInput({
        stateRevision: "state-known-2",
        knownMark: {
          markId: "known-mark-1",
          revision: "known-revision-1",
          markedAt: "2026-07-30T08:00:00.000Z",
        },
      }),
    );

    const senseCard = response.groups[0].entries[0];
    expect(senseCard.kind).toBe("sense-card");
    if (senseCard.kind !== "sense-card") {
      throw new Error("Expected a SenseCard");
    }
    expect(senseCard.card).toEqual(
      expect.objectContaining({
        knownMark: {
          markId: "known-mark-1",
          revision: "known-revision-1",
          markedAt: "2026-07-30T08:00:00.000Z",
        },
        stateRevision: "state-known-2",
      }),
    );
    expect(senseCard.capabilities).toEqual(
      expect.arrayContaining([
        {
          actionId: "undo-known",
          elementId: "sense-card.known.undo",
          messageKey: "senseCard.known.undo",
          target: {
            kind: "sense-card",
            entryId: "entry-known",
            cardTypeId: "word-to-definition",
            stateRevision: "state-known-2",
            activeKnownMarkId: "known-mark-1",
            knownMarkRevision: "known-revision-1",
          },
        },
      ]),
    );
    expect(
      senseCard.capabilities.filter((capability) =>
        [
          "start-learning",
          "mark-known",
          "review-card",
        ].includes(capability.actionId),
      ),
    ).toEqual([]);
  });

  test("treats an expired freeze as inactive, matching the action RPC phase", () => {
    const input = projectionInput({
      stateRevision: "state-expired-freeze",
      knownMark: null,
    });
    const cardState = input.entries[0].cardState;
    if (!cardState) throw new Error("Expected card state");
    cardState.frozenUntil = "2000-01-01T00:00:00.000Z";

    const response = projectPlatformLookupV2(input);
    const senseCard = response.groups[0].entries[0];
    expect(senseCard.kind).toBe("sense-card");
    if (senseCard.kind !== "sense-card") {
      throw new Error("Expected a SenseCard");
    }
    expect(senseCard.card?.scheduler.phase).toBe("not-started");
    expect(senseCard.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionId: "start-learning" }),
        expect.objectContaining({ actionId: "mark-known" }),
      ]),
    );
  });

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
            displayName: "Van Dale",
            messageKey: "dictionary.name",
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
              reportContentRevision: null,
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
                  actionId: "mark-known",
                  elementId: "sense-card.known.mark",
                  messageKey: "senseCard.known.mark",
                  target: {
                    kind: "sense-card",
                    entryId: "entry-1",
                    cardTypeId: "word-to-definition",
                    stateRevision: "state-revision-1",
                  },
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
    expect(JSON.stringify(response)).toContain("mark-known");
    expect(JSON.stringify(response)).not.toContain("undo-known");
  });

  test("uses controlled dictionary copy with a server-provided user dictionary name", () => {
    const response = projectPlatformLookupV2({
      query: "huis",
      request: {
        contentLanguageCode: "nl",
        translationTargetLanguageCode: null,
        cardTypeId: "word-to-definition",
        intent: "dictionary-lookup",
      },
      page: {
        selectedTierComplete: true,
        nextGroupCursor: null,
      },
      entries: [
        {
          headwordGroupId: "private-group-1",
          allowMutationCapabilities: false,
          entry: {
            id: "private-entry-1",
            dictionaryId: "private-dictionary-1",
            languageCode: "nl",
            headword: "huis",
            meaningId: 1,
            partOfSpeech: "zn",
            gender: "het",
            contentFingerprint: "private-content-revision-1",
            raw: {},
            content: {
              headword: "huis",
              languageCode: "nl",
              meaningId: 1,
              partOfSpeech: "zn",
              gender: "het",
              meanings: [{ definition: "mijn eigen definitie" }],
              summary: { definition: "mijn eigen definitie" },
              sections: [
                {
                  id: "definition",
                  sourcePath: "raw.definition",
                  kind: "meaning",
                  text: "mijn eigen definitie",
                },
              ],
            },
          },
          dictionary: {
            id: "private-dictionary-1",
            languageCode: "nl",
            slug: "user-7b0dcd42",
            name: "Mijn reiswoorden",
            kind: "user",
            visibility: "private",
          },
          contentNodeBindings: [
            {
              contentNodeId: "private-node-definition-1",
              sourcePath: "raw.definition",
              kind: "definition",
              sourceTextFingerprint: "private-definition-fingerprint-1",
            },
          ],
          cardState: null,
        },
      ],
    });

    expect(response.groups[0].dictionary).toEqual({
      dictionaryId: "private-dictionary-1",
      sourceLanguageCode: "nl",
      displayName: "Mijn reiswoorden",
      messageKey: "dictionary.name",
    });
    expect(JSON.stringify(response)).not.toContain(
      "dictionary.user-7b0dcd42",
    );
  });
});

function projectionInput(
  state: {
    stateRevision: string;
    knownMark: null | {
      markId: string;
      revision: string;
      markedAt: string;
    };
  },
): Parameters<typeof projectPlatformLookupV2>[0] {
  return {
    query: "huis",
    request: {
      contentLanguageCode: "nl",
      translationTargetLanguageCode: null,
      cardTypeId: "word-to-definition",
      intent: "external-click",
    },
    page: {
      selectedTierComplete: true,
      nextGroupCursor: null,
    },
    entries: [
      {
        headwordGroupId: "group-known",
        entry: {
          id: "entry-known",
          dictionaryId: "dict-1",
          languageCode: "nl",
          headword: "huis",
          meaningId: 1,
          partOfSpeech: "zn",
          gender: "het",
          contentFingerprint: "content-known-1",
          raw: {},
          content: {
            headword: "huis",
            languageCode: "nl",
            meaningId: 1,
            partOfSpeech: "zn",
            gender: "het",
            meanings: [{ definition: "een gebouw om in te wonen" }],
            summary: { definition: "een gebouw om in te wonen" },
            sections: [
              {
                id: "meaning-1",
                sourcePath: "raw.meanings[0].definition",
                kind: "meaning",
                text: "een gebouw om in te wonen",
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
            contentNodeId: "node-definition-known",
            sourcePath: "raw.meanings[0].definition",
            kind: "definition",
            sourceTextFingerprint: "definition-known-1",
          },
        ],
        cardState: {
          ...state,
          clickCount: 0,
          seenCount: 0,
          successCount: 0,
          lastSeenAt: null,
          lastReviewedAt: null,
          nextReviewAt: null,
          hidden: false,
          frozenUntil: null,
          inLearning: false,
          learningDueAt: null,
          fsrs: {
            stability: null,
            difficulty: null,
            reps: 0,
            lapses: 0,
            lastGrade: null,
            lastInterval: null,
            paramsVersion: null,
          },
        } as never,
      },
    ],
  };
}
