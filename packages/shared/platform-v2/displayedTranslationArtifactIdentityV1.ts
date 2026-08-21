const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/;
const CONTENT_NODE_ID_PATTERN = /^[\x21-\x7e]{1,128}$/;
const REVISION_PATTERN = /^[\x20-\x7e]{1,128}$/;

export type DisplayedEntryTranslationArtifactIdentityV1 = {
  targetKind: "entry";
  entryId: string;
  contentNodeId: null;
  translationId: string;
  targetLanguageCode: string;
  sourceContentFingerprint: string;
  translationPolicyVersion: string;
  providerRevision: string | null;
};

export type DisplayedContentNodeTranslationArtifactIdentityV1 = {
  targetKind: "content-node";
  entryId: string;
  contentNodeId: string;
  translationId: string;
  targetLanguageCode: string;
  sourceTextFingerprint: string;
  translationPolicyVersion: string;
  providerRevision: string | null;
};

export type DisplayedTranslationArtifactIdentityV1 =
  | DisplayedEntryTranslationArtifactIdentityV1
  | DisplayedContentNodeTranslationArtifactIdentityV1;

export type DisplayedTranslationArtifactIdentityParseResultV1 =
  | { ok: true; value: DisplayedTranslationArtifactIdentityV1 }
  | { ok: false; error: "invalid-translation-artifact-identity" };

export function parseDisplayedTranslationArtifactIdentityV1(
  input: unknown,
): DisplayedTranslationArtifactIdentityParseResultV1 {
  if (!isRecord(input) || !hasExactIdentityKeys(input)) return invalidIdentity();
  if (
    !UUID_PATTERN.test(asString(input.entryId)) ||
    !isCanonicalTranslationLanguageCodeV1(input.targetLanguageCode) ||
    !REVISION_PATTERN.test(asString(input.translationPolicyVersion)) ||
    !isNullableRevision(input.providerRevision)
  ) {
    return invalidIdentity();
  }

  if (
    input.targetKind === "entry" &&
    input.contentNodeId === null &&
    UUID_PATTERN.test(asString(input.translationId)) &&
    SHA256_PATTERN.test(asString(input.sourceContentFingerprint))
  ) {
    return {
      ok: true,
      value: input as DisplayedEntryTranslationArtifactIdentityV1,
    };
  }

  if (
    input.targetKind === "content-node" &&
    CONTENT_NODE_ID_PATTERN.test(asString(input.contentNodeId)) &&
    SHA256_PATTERN.test(asString(input.translationId)) &&
    SHA256_PATTERN.test(asString(input.sourceTextFingerprint))
  ) {
    return {
      ok: true,
      value: input as DisplayedContentNodeTranslationArtifactIdentityV1,
    };
  }

  return invalidIdentity();
}

export function isDisplayedTranslationArtifactIdentityV1(
  input: unknown,
): input is DisplayedTranslationArtifactIdentityV1 {
  return parseDisplayedTranslationArtifactIdentityV1(input).ok;
}

export function isCanonicalTranslationLanguageCodeV1(
  input: unknown,
): input is string {
  return (
    typeof input === "string" &&
    input.length >= 2 &&
    input.length <= 35 &&
    LANGUAGE_CODE_PATTERN.test(input)
  );
}

export function isExactRenderableEntryTranslationV1(
  translation: {
    entryId: string;
    isFresh: boolean;
    sourceContentFingerprint: string;
    status: string;
    text?: string;
  } | null,
  current: { entryId: string; sourceContentFingerprint: string | null },
): translation is NonNullable<typeof translation> & { text: string } {
  return Boolean(
    translation?.status === "ready" &&
      translation.isFresh &&
      translation.text &&
      translation.entryId === current.entryId &&
      translation.sourceContentFingerprint === current.sourceContentFingerprint,
  );
}

export function firstExactRenderableNodeTranslationV1<
  Translation extends {
    sourceTextFingerprint: string;
    status: string;
    text?: string;
  },
>(
  translations: readonly Translation[],
  currentSourceTextFingerprint: string,
): (Translation & { text: string }) | null {
  return (
    translations.find(
      (candidate) =>
        candidate.status === "ready" &&
        Boolean(candidate.text) &&
        candidate.sourceTextFingerprint === currentSourceTextFingerprint,
    ) as (Translation & { text: string }) | undefined
  ) ?? null;
}

function hasExactIdentityKeys(input: Record<string, unknown>) {
  const expected =
    input.targetKind === "entry"
      ? [
          "contentNodeId",
          "entryId",
          "providerRevision",
          "sourceContentFingerprint",
          "targetKind",
          "targetLanguageCode",
          "translationId",
          "translationPolicyVersion",
        ]
      : input.targetKind === "content-node"
        ? [
            "contentNodeId",
            "entryId",
            "providerRevision",
            "sourceTextFingerprint",
            "targetKind",
            "targetLanguageCode",
            "translationId",
            "translationPolicyVersion",
          ]
        : [];
  return (
    expected.length > 0 &&
    Object.keys(input).sort().join("\0") === expected.sort().join("\0")
  );
}

function isNullableRevision(value: unknown) {
  return value === null || REVISION_PATTERN.test(asString(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function invalidIdentity(): DisplayedTranslationArtifactIdentityParseResultV1 {
  return { ok: false, error: "invalid-translation-artifact-identity" };
}
