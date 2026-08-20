import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { projectPlatformLookupV2 } from "@/lib/platform/projections/senseCardV2";
import {
  PLATFORM_V2_REQUIRED_MESSAGE_KEYS,
  PLATFORM_V2_SUPPORTED_INTERFACE_LANGUAGES,
} from "../../../packages/shared/platform-v2/localization";

const fixtureRoot = path.resolve(
  process.cwd(),
  "../../packages/shared/fixtures/platform-v2",
);

const readJson = (file: string) =>
  JSON.parse(fs.readFileSync(path.join(fixtureRoot, file), "utf8"));

describe("Platform V2 shared consumer contract", () => {
  test("pins a public single-sense projection as an immutable consumer fixture", () => {
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
          headwordGroupId: "fixture-group-huis",
          allowMutationCapabilities: false,
          allowWordDetailsCapability: false,
          entry: {
            id: "fixture-entry-huis-1",
            dictionaryId: "fixture-dictionary-vandale",
            languageCode: "nl",
            headword: "huis",
            meaningId: 1,
            partOfSpeech: "zn",
            gender: "het",
            contentFingerprint: "fixture-content-revision-huis-1",
            raw: {},
            content: {
              headword: "huis",
              languageCode: "nl",
              meaningId: 1,
              partOfSpeech: "zn",
              gender: "het",
              meanings: [
                { definition: "een gebouw om in te wonen" },
              ],
              summary: {
                definition: "een gebouw om in te wonen",
              },
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
            id: "fixture-dictionary-vandale",
            languageCode: "nl",
            slug: "nl-vandale",
            name: "Van Dale",
            kind: "curated",
            visibility: "system",
          },
          contentNodeBindings: [
            {
              contentNodeId: "fixture-node-huis-definition",
              sourcePath: "raw.meanings[0].definition",
              kind: "definition",
              sourceTextFingerprint:
                "fixture-fingerprint-huis-definition",
            },
          ],
          cardState: null,
          entryTranslation: {
            translationId: "fixture-translation-huis-ru",
            entryId: "fixture-entry-huis-1",
            targetLanguageCode: "ru",
            status: "ready",
            text: "дом",
            alternativeTexts: ["жилище"],
            baseText: "дом",
            note: null,
            sourceContentFingerprint: "fixture-content-revision-huis-1",
            translationPolicyVersion: "translation-policy-v1",
            providerRevision: "fixture-provider-revision",
            isFresh: true,
          },
        },
      ],
    });

    expect(response).toEqual(readJson("catalog-single-sense.json"));
    expect(JSON.stringify(response)).not.toContain("sourcePath");
    expect(JSON.stringify(response)).not.toContain('"raw"');
  });

  test("pins the cross-reference union without learning semantics", () => {
    const response = projectPlatformLookupV2({
      query: "selder",
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
          headwordGroupId: "fixture-group-selder",
          meaningOrdinal: 1,
          crossReferenceQuery: "selderie",
          crossReferenceTarget: {
            query: "selderie",
            headwordGroupId: "fixture-group-selderie",
            entryId: "fixture-entry-selderie-1",
          },
          allowMutationCapabilities: false,
          allowWordDetailsCapability: false,
          entry: {
            id: "fixture-entry-selder-1",
            dictionaryId: "fixture-dictionary-vandale",
            languageCode: "nl",
            headword: "selder",
            meaningId: 1,
            partOfSpeech: "zn",
            gender: null,
            contentFingerprint: "fixture-content-revision-selder-1",
            raw: {},
            content: {
              headword: "selder",
              languageCode: "nl",
              meaningId: 1,
              partOfSpeech: "zn",
              gender: null,
              meanings: [],
              summary: { definition: "" },
              sections: [],
            },
          },
          dictionary: {
            id: "fixture-dictionary-vandale",
            languageCode: "nl",
            slug: "nl-vandale",
            name: "Van Dale",
            kind: "curated",
            visibility: "system",
          },
          contentNodeBindings: [],
          cardState: null,
        },
      ],
    });

    expect(response).toEqual(readJson("catalog-cross-reference.json"));
    expect(response.groups[0].senseCount).toBe(0);
    expect(JSON.stringify(response)).not.toContain("review-card");
  });

  test("keeps every required semantic message key in every supported locale", () => {
    for (const language of PLATFORM_V2_SUPPORTED_INTERFACE_LANGUAGES) {
      const catalog = JSON.parse(
        fs.readFileSync(
          path.resolve(process.cwd(), `locales/${language}.json`),
          "utf8",
        ),
      );
      const keys = flattenKeys(catalog);
      expect(
        PLATFORM_V2_REQUIRED_MESSAGE_KEYS.filter(
          (key) => !keys.has(key),
        ),
        `missing Platform V2 keys for ${language}`,
      ).toEqual([]);
    }
  });

  test("manifest names every shared lookup fixture", () => {
    const manifest = readJson("manifest.json");
    expect(manifest).toEqual({
      fixtureVersion: "platform-v2-consumer-fixtures-3",
      contractVersion: "platform-lookup-v2",
      files: [
        "catalog-single-sense.json",
        "catalog-cross-reference.json",
        "known-action-roundtrip.json",
        "rollout-matrix.json",
      ],
    });
    for (const file of manifest.files) {
      expect(fs.existsSync(path.join(fixtureRoot, file))).toBe(true);
    }
  });

  test("pins one server-owned Known and exact Undo roundtrip for both consumers", () => {
    const fixture = readJson("known-action-roundtrip.json");
    expect(fixture.markRequest.target).toEqual(
      fixture.initialCapability.target,
    );
    expect(fixture.initialCapability.target.stateRevision).toBe(
      fixture.initialCard.stateRevision,
    );
    expect(fixture.markResponse.card.scheduler).toEqual(
      fixture.initialCard.scheduler,
    );
    expect(fixture.markResponse.card.knownMark).toEqual({
      markId: fixture.undoCapability.target.activeKnownMarkId,
      revision: fixture.undoCapability.target.knownMarkRevision,
      markedAt: "2026-07-30T08:00:00.000Z",
    });
    expect(fixture.undoRequest.target).toEqual(
      fixture.undoCapability.target,
    );
    expect(fixture.undoRequest.target.stateRevision).toBe(
      fixture.markResponse.card.stateRevision,
    );
    expect(fixture.undoResponse).toEqual(
      expect.objectContaining({
        actionId: "undo-known",
        clientEventId: fixture.undoRequest.clientEventId,
        accepted: true,
      }),
    );
    expect(fixture.undoResponse.card.scheduler).toEqual(
      fixture.initialCard.scheduler,
    );
    expect(fixture.undoResponse.card.knownMark).toBeNull();
    expect(fixture.undoResponse.card.stateRevision).not.toBe(
      fixture.markResponse.card.stateRevision,
    );
  });

  test("keeps V2 consumers behind a V2-capable server and rollback consumer-first", () => {
    const matrix = readJson("rollout-matrix.json");
    for (const row of matrix.serverModes) {
      const hasV2Consumer =
        row.consumer2000nl === "v2" ||
        row.consumerAudioFilms === "v2";
      if (hasV2Consumer && row.server === "v1-only") {
        expect(row.allowed).toBe(false);
      }
    }
    expect(matrix.rules).toEqual(
      expect.objectContaining({
        oneContractVersionPerRenderedCard: true,
        consumerSwitchesIndependent: true,
        rollbackOrder: [
          "disable-affected-consumer-v2",
          "verify-v1-consumer-smoke",
          "keep-v2-for-remaining-consumers",
        ],
        emittedIdentityPolicy:
          "retire-or-roll-forward-never-reassign",
        acceptedKnownMarkRollback:
          "disable-consumer-surface-preserve-server-state",
      }),
    );
  });
});

function flattenKeys(
  value: unknown,
  prefix = "",
  output = new Set<string>(),
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) output.add(prefix);
    return output;
  }
  for (const [key, child] of Object.entries(
    value as Record<string, unknown>,
  )) {
    flattenKeys(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}
