import { describe, expect, test } from "vitest";
import {
  parseDisplayedTranslationArtifactIdentityV1,
  verifyDisplayedTranslationAtomsV1,
} from "../../../packages/shared/diagnostic-report/displayedTranslationArtifactV1";

const entryId = "11111111-1111-4111-8111-111111111111";
const entryTranslationId = "22222222-2222-4222-8222-222222222222";
const nodeTranslationId = "a".repeat(64);
const fingerprint = "b".repeat(64);
const policy = "dictionary-meaning-v2:openai:test";

const authorizedEntry = {
  entryId,
  currentSourceContentFingerprint: fingerprint,
  translation: {
    translationId: entryTranslationId,
    entryId,
    targetLanguageCode: "ru",
    status: "ready" as const,
    text: "дом",
    sourceContentFingerprint: fingerprint,
    translationPolicyVersion: policy,
    isFresh: true,
  },
  contentNodes: [
    {
      contentNodeId: "definition:stable-node-1",
      order: 0,
      sourceTextFingerprint: fingerprint,
      translations: [
        {
          translationId: nodeTranslationId,
          targetLanguageCode: "ru",
          status: "ready" as const,
          text: "здание, в котором живут",
          sourceTextFingerprint: fingerprint,
          translationPolicyVersion: policy,
          providerRevision: "prompt-sha256:test",
        },
      ],
    },
  ],
};

describe("diagnostic displayed-translation artifact identity v1", () => {
  test("accepts the real UUID entry artifact and SHA-256 node artifact identity shapes", () => {
    expect(
      parseDisplayedTranslationArtifactIdentityV1({
        targetKind: "entry",
        entryId,
        contentNodeId: null,
        translationId: entryTranslationId,
        targetLanguageCode: "ru",
        sourceContentFingerprint: fingerprint,
        translationPolicyVersion: "dictionary-meaning-v2:openai:test",
        providerRevision: null,
      }),
    ).toEqual({
      ok: true,
      value: {
        targetKind: "entry",
        entryId,
        contentNodeId: null,
        translationId: entryTranslationId,
        targetLanguageCode: "ru",
        sourceContentFingerprint: fingerprint,
        translationPolicyVersion: "dictionary-meaning-v2:openai:test",
        providerRevision: null,
      },
    });

    expect(
      parseDisplayedTranslationArtifactIdentityV1({
        targetKind: "content-node",
        entryId,
        contentNodeId: "definition:stable-node-1",
        translationId: nodeTranslationId,
        targetLanguageCode: "ru",
        sourceTextFingerprint: fingerprint,
        translationPolicyVersion: "dictionary-meaning-v2:openai:test",
        providerRevision: "prompt-sha256:test",
      }),
    ).toEqual({
      ok: true,
      value: {
        targetKind: "content-node",
        entryId,
        contentNodeId: "definition:stable-node-1",
        translationId: nodeTranslationId,
        targetLanguageCode: "ru",
        sourceTextFingerprint: fingerprint,
        translationPolicyVersion: "dictionary-meaning-v2:openai:test",
        providerRevision: "prompt-sha256:test",
      },
    });
  });

  test("rejects swapping the entry UUID and node digest identity formats", () => {
    expect(
      parseDisplayedTranslationArtifactIdentityV1({
        targetKind: "entry",
        entryId,
        contentNodeId: null,
        translationId: nodeTranslationId,
        targetLanguageCode: "ru",
        sourceContentFingerprint: fingerprint,
        translationPolicyVersion: "dictionary-meaning-v2:openai:test",
        providerRevision: null,
      }),
    ).toEqual({ ok: false, error: "invalid-translation-artifact-identity" });

    expect(
      parseDisplayedTranslationArtifactIdentityV1({
        targetKind: "content-node",
        entryId,
        contentNodeId: "definition:stable-node-1",
        translationId: entryTranslationId,
        targetLanguageCode: "ru",
        sourceTextFingerprint: fingerprint,
        translationPolicyVersion: "dictionary-meaning-v2:openai:test",
        providerRevision: null,
      }),
    ).toEqual({ ok: false, error: "invalid-translation-artifact-identity" });
  });

  test("keeps the artifact object closed and never falls back to a connected-client language label", () => {
    const unsafe = {
      targetKind: "entry",
      entryId,
      contentNodeId: null,
      translationId: entryTranslationId,
      sourceContentFingerprint: fingerprint,
      translationPolicyVersion: policy,
      providerRevision: null,
      providerPayload: { prompt: "must never be reportable" },
    };
    expect(parseDisplayedTranslationArtifactIdentityV1(unsafe)).toEqual({
      ok: false,
      error: "invalid-translation-artifact-identity",
    });
    const { providerPayload: _removed, ...missingLanguage } = unsafe;
    expect(
      parseDisplayedTranslationArtifactIdentityV1({
        ...missingLanguage,
        connectedClientLanguageLabel: "ru",
      }),
    ).toEqual({
      ok: false,
      error: "invalid-translation-artifact-identity",
    });
  });

  test("accepts only lower-case ASCII language codes up to 35 characters", () => {
    const identity = {
      targetKind: "entry",
      entryId,
      contentNodeId: null,
      translationId: entryTranslationId,
      sourceContentFingerprint: fingerprint,
      translationPolicyVersion: policy,
      providerRevision: null,
    };
    const valid35 = "aa-bbbbbbbb-cccccccc-dddddddd-eeeee";
    expect(valid35).toHaveLength(35);
    expect(
      parseDisplayedTranslationArtifactIdentityV1({
        ...identity,
        targetLanguageCode: valid35,
      }).ok,
    ).toBe(true);
    for (const targetLanguageCode of [
      `${valid35}f`,
      "RU",
      "rü",
    ]) {
      expect(
        parseDisplayedTranslationArtifactIdentityV1({
          ...identity,
          targetLanguageCode,
        }),
      ).toEqual({
        ok: false,
        error: "invalid-translation-artifact-identity",
      });
    }
  });

  test("reconstructs and exact-matches entry and node translations from one authorized projection", () => {
    expect(
      verifyDisplayedTranslationAtomsV1({
        authorizedEntry,
        submittedAtoms: [
          {
            role: "displayed-translation",
            contentNodeId: null,
            text: "дом",
            truncated: false,
            artifact: {
              targetKind: "entry",
              entryId,
              contentNodeId: null,
              translationId: entryTranslationId,
              targetLanguageCode: "ru",
              sourceContentFingerprint: fingerprint,
              translationPolicyVersion: policy,
              providerRevision: null,
            },
          },
          {
            role: "displayed-translation",
            contentNodeId: "definition:stable-node-1",
            text: "здание, в котором живут",
            truncated: false,
            artifact: {
              targetKind: "content-node",
              entryId,
              contentNodeId: "definition:stable-node-1",
              translationId: nodeTranslationId,
              targetLanguageCode: "ru",
              sourceTextFingerprint: fingerprint,
              translationPolicyVersion: policy,
              providerRevision: "prompt-sha256:test",
            },
          },
        ],
      }),
    ).toEqual({ ok: true });
  });

  test("reconstructs only the first exact node artifact selected for rendering", () => {
    const multiple = structuredClone(authorizedEntry);
    multiple.translation = null as never;
    multiple.contentNodes[0]!.translations.push({
      ...multiple.contentNodes[0]!.translations[0]!,
      translationId: "c".repeat(64),
      targetLanguageCode: "en",
      text: "a building to live in",
    });
    expect(
      verifyDisplayedTranslationAtomsV1({
        authorizedEntry: multiple,
        submittedAtoms: [
          {
            role: "displayed-translation",
            contentNodeId: "definition:stable-node-1",
            text: "здание, в котором живут",
            truncated: false,
            artifact: {
              targetKind: "content-node",
              entryId,
              contentNodeId: "definition:stable-node-1",
              translationId: nodeTranslationId,
              targetLanguageCode: "ru",
              sourceTextFingerprint: fingerprint,
              translationPolicyVersion: policy,
              providerRevision: "prompt-sha256:test",
            },
          },
        ],
      }),
    ).toEqual({ ok: true });
  });

  test("compares artifacts with the authoritative current entry and node revisions", () => {
    const staleEntry = structuredClone(authorizedEntry);
    staleEntry.translation.sourceContentFingerprint = "c".repeat(64);
    expect(
      verifyDisplayedTranslationAtomsV1({
        authorizedEntry: staleEntry,
        submittedAtoms: [
          {
            role: "displayed-translation",
            contentNodeId: null,
            text: "дом",
            truncated: false,
            artifact: {
              targetKind: "entry",
              entryId,
              contentNodeId: null,
              translationId: entryTranslationId,
              targetLanguageCode: "ru",
              sourceContentFingerprint: "c".repeat(64),
              translationPolicyVersion: policy,
              providerRevision: null,
            },
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: "unverifiable-displayed-translation",
    });

    const staleNode = structuredClone(authorizedEntry);
    staleNode.translation = null as never;
    staleNode.contentNodes[0]!.translations[0]!.sourceTextFingerprint =
      "c".repeat(64);
    expect(
      verifyDisplayedTranslationAtomsV1({
        authorizedEntry: staleNode,
        submittedAtoms: [
          {
            role: "displayed-translation",
            contentNodeId: "definition:stable-node-1",
            text: "здание, в котором живут",
            truncated: false,
            artifact: {
              targetKind: "content-node",
              entryId,
              contentNodeId: "definition:stable-node-1",
              translationId: nodeTranslationId,
              targetLanguageCode: "ru",
              sourceTextFingerprint: "c".repeat(64),
              translationPolicyVersion: policy,
              providerRevision: "prompt-sha256:test",
            },
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: "unverifiable-displayed-translation",
    });
  });

  test.each([
    ["target language", { targetLanguageCode: "en" }],
    ["translation policy", { translationPolicyVersion: "policy:stale" }],
    ["provider revision", { providerRevision: "prompt:stale" }],
    ["source revision", { sourceTextFingerprint: "c".repeat(64) }],
    ["artifact ID", { translationId: "d".repeat(64) }],
  ])("fails closed on node %s mismatch", (_label, mismatch) => {
    const exactNodeAtom = {
      role: "displayed-translation" as const,
      contentNodeId: "definition:stable-node-1",
      text: "здание, в котором живут",
      truncated: false,
      artifact: {
        targetKind: "content-node" as const,
        entryId,
        contentNodeId: "definition:stable-node-1",
        translationId: nodeTranslationId,
        targetLanguageCode: "ru",
        sourceTextFingerprint: fingerprint,
        translationPolicyVersion: policy,
        providerRevision: "prompt-sha256:test",
        ...mismatch,
      },
    };
    expect(
      verifyDisplayedTranslationAtomsV1({
        authorizedEntry: { ...authorizedEntry, translation: null },
        submittedAtoms: [exactNodeAtom],
      }),
    ).toEqual({
      ok: false,
      error: "unverifiable-displayed-translation",
    });
  });

  test("fails closed for stale/missing artifacts, unauthorized entries, reordering and duplicates", () => {
    const exact = verifyDisplayedTranslationAtomsV1({
      authorizedEntry,
      submittedAtoms: [],
    });
    expect(exact).toEqual({
      ok: false,
      error: "unverifiable-displayed-translation",
    });
    expect(
      verifyDisplayedTranslationAtomsV1({
        authorizedEntry: null,
        submittedAtoms: [],
      }),
    ).toEqual({ ok: false, error: "unauthorized-translation-target" });

    const staleEntry = structuredClone(authorizedEntry);
    staleEntry.translation.isFresh = false;
    staleEntry.contentNodes[0]!.translations = [];
    expect(
      verifyDisplayedTranslationAtomsV1({
        authorizedEntry: staleEntry,
        submittedAtoms: [
          {
            role: "displayed-translation",
            contentNodeId: null,
            text: "дом",
            truncated: false,
            artifact: {
              targetKind: "entry",
              entryId,
              contentNodeId: null,
              translationId: entryTranslationId,
              targetLanguageCode: "ru",
              sourceContentFingerprint: fingerprint,
              translationPolicyVersion: policy,
              providerRevision: null,
            },
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: "unverifiable-displayed-translation",
    });

    const atoms = [
      {
        role: "displayed-translation" as const,
        contentNodeId: null,
        text: "дом",
        truncated: false,
        artifact: {
          targetKind: "entry" as const,
          entryId,
          contentNodeId: null,
          translationId: entryTranslationId,
          targetLanguageCode: "ru",
          sourceContentFingerprint: fingerprint,
          translationPolicyVersion: policy,
          providerRevision: null,
        },
      },
      {
        role: "displayed-translation" as const,
        contentNodeId: "definition:stable-node-1",
        text: "здание, в котором живут",
        truncated: false,
        artifact: {
          targetKind: "content-node" as const,
          entryId,
          contentNodeId: "definition:stable-node-1",
          translationId: nodeTranslationId,
          targetLanguageCode: "ru",
          sourceTextFingerprint: fingerprint,
          translationPolicyVersion: policy,
          providerRevision: "prompt-sha256:test",
        },
      },
    ];
    for (const submittedAtoms of [[...atoms].reverse(), [...atoms, atoms[1]!]]) {
      expect(
        verifyDisplayedTranslationAtomsV1({ authorizedEntry, submittedAtoms }),
      ).toEqual({
        ok: false,
        error: "unverifiable-displayed-translation",
      });
    }
  });

  test("reconstructs NFC text and truncates before exact comparison at both atom bounds", () => {
    const overLimit = `${"😀".repeat(1500)}x`;
    expect(
      verifyDisplayedTranslationAtomsV1({
        authorizedEntry: {
          ...authorizedEntry,
          translation: {
            ...authorizedEntry.translation,
            text: overLimit,
          },
          contentNodes: [],
        },
        submittedAtoms: [
          {
            role: "displayed-translation",
            contentNodeId: null,
            text: "😀".repeat(1500),
            truncated: true,
            artifact: {
              targetKind: "entry",
              entryId,
              contentNodeId: null,
              translationId: entryTranslationId,
              targetLanguageCode: "ru",
              sourceContentFingerprint: fingerprint,
              translationPolicyVersion: policy,
              providerRevision: null,
            },
          },
        ],
      }),
    ).toEqual({ ok: true });
  });
});
