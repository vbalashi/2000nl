import { describe, expect, test } from "vitest";
import { isPlatformLookupV2Response } from "../../../packages/shared/types/platformV2Runtime";

const entryId = "11111111-1111-4111-8111-111111111111";
const translationId = "22222222-2222-4222-8222-222222222222";
const fingerprint = "a".repeat(64);

function responseWithArtifact(targetLanguageCode: string) {
  return {
    contractVersion: "platform-lookup-v2",
    query: "huis",
    request: {
      contentLanguageCode: "nl",
      translationTargetLanguageCode: targetLanguageCode,
      cardTypeId: "word-to-definition",
      intent: "external-click",
    },
    groups: [
      {
        headwordGroupId: "group-1",
        dictionary: {
          dictionaryId: "dictionary-1",
          sourceLanguageCode: "nl",
          displayName: "Dictionary",
          messageKey: "dictionary.name",
        },
        header: { text: "huis" },
        senseCount: 1,
        entryCount: 1,
        indicators: [],
        entries: [
          {
            kind: "sense-card",
            entryId,
            meaningOrdinal: 1,
            card: null,
            contentRevision: fingerprint,
            summaryContentNodeId: null,
            contentNodes: [],
            translation: null,
            capabilities: [
              {
                actionId: "report-content",
                elementId: "sense-card.report.translation",
                messageKey: "senseCard.report",
                target: {
                  kind: "translation",
                  targetKind: "entry",
                  entryId,
                  contentNodeId: null,
                  translationId,
                  targetLanguageCode,
                  sourceContentFingerprint: fingerprint,
                  translationPolicyVersion: "policy:v1",
                  providerRevision: null,
                },
              },
            ],
          },
        ],
      },
    ],
    page: { selectedTierComplete: true, nextGroupCursor: null },
  };
}

describe("Platform V2 displayed translation runtime contract", () => {
  test("uses the same closed 2-35 ASCII artifact identity as diagnostic reports", () => {
    const valid35 = "aa-bbbbbbbb-cccccccc-dddddddd-eeeee";
    const valid = responseWithArtifact(valid35);
    expect(isPlatformLookupV2Response(valid)).toBe(true);

    const unknownField = structuredClone(valid);
    (unknownField.groups[0]!.entries[0]!.capabilities[0]!.target as any)
      .providerPayload = { prompt: "private" };
    expect(isPlatformLookupV2Response(unknownField)).toBe(false);
    expect(
      isPlatformLookupV2Response(responseWithArtifact(`${valid35}f`)),
    ).toBe(false);
  });
});
