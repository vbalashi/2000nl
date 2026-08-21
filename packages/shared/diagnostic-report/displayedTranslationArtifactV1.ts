import type {
  PlatformContentNodeV2,
  PlatformSenseCardEntryV2,
} from "../types/platformV2";
import {
  firstExactRenderableNodeTranslationV1,
  isExactRenderableEntryTranslationV1,
  parseDisplayedTranslationArtifactIdentityV1,
  type DisplayedTranslationArtifactIdentityV1,
} from "../platform-v2/displayedTranslationArtifactIdentityV1";

export {
  parseDisplayedTranslationArtifactIdentityV1,
  type DisplayedContentNodeTranslationArtifactIdentityV1,
  type DisplayedEntryTranslationArtifactIdentityV1,
  type DisplayedTranslationArtifactIdentityParseResultV1,
  type DisplayedTranslationArtifactIdentityV1,
} from "../platform-v2/displayedTranslationArtifactIdentityV1";

export const DISPLAYED_TRANSLATION_ATOM_MAX_SCALARS_V1 = 1_500;
export const DISPLAYED_TRANSLATION_ATOM_MAX_UTF8_BYTES_V1 = 6_000;

export type DisplayedTranslationAtomV1 = {
  role: "displayed-translation";
  contentNodeId: string | null;
  text: string;
  truncated: boolean;
  artifact: DisplayedTranslationArtifactIdentityV1;
};

type AuthorizedDisplayedTranslationProjectionV1 = Pick<
  PlatformSenseCardEntryV2,
  "entryId" | "translation"
> & {
  currentSourceContentFingerprint: string;
  contentNodes: Array<
    Pick<
      PlatformContentNodeV2,
      "contentNodeId" | "order" | "sourceTextFingerprint" | "translations"
    >
  >;
};

export type DisplayedTranslationAtomVerificationResultV1 =
  | { ok: true }
  | {
      ok: false;
      error:
        | "unauthorized-translation-target"
        | "unverifiable-displayed-translation";
    };

export function verifyDisplayedTranslationAtomsV1(input: {
  authorizedEntry: AuthorizedDisplayedTranslationProjectionV1 | null;
  submittedAtoms: unknown;
}): DisplayedTranslationAtomVerificationResultV1 {
  if (!input.authorizedEntry) {
    return { ok: false, error: "unauthorized-translation-target" };
  }
  if (!Array.isArray(input.submittedAtoms)) {
    return { ok: false, error: "unverifiable-displayed-translation" };
  }
  const submitted = input.submittedAtoms.map(parseDisplayedTranslationAtomV1);
  if (submitted.some((atom) => atom === null)) {
    return { ok: false, error: "unverifiable-displayed-translation" };
  }
  const reconstructed = reconstructDisplayedTranslationAtomsV1(
    input.authorizedEntry,
  );
  return canonicalJson(submitted) === canonicalJson(reconstructed)
    ? { ok: true }
    : { ok: false, error: "unverifiable-displayed-translation" };
}

function reconstructDisplayedTranslationAtomsV1(
  entry: AuthorizedDisplayedTranslationProjectionV1,
): DisplayedTranslationAtomV1[] {
  const atoms: DisplayedTranslationAtomV1[] = [];
  const entryTranslation = entry.translation;
  if (
    isExactRenderableEntryTranslationV1(entryTranslation, {
      entryId: entry.entryId,
      sourceContentFingerprint: entry.currentSourceContentFingerprint,
    })
  ) {
    atoms.push(
      buildDisplayedTranslationAtomV1(
        null,
        entryTranslation.text,
        {
          targetKind: "entry",
          entryId: entry.entryId,
          contentNodeId: null,
          translationId: entryTranslation.translationId,
          targetLanguageCode: entryTranslation.targetLanguageCode,
          sourceContentFingerprint:
            entryTranslation.sourceContentFingerprint,
          translationPolicyVersion:
            entryTranslation.translationPolicyVersion,
          providerRevision: entryTranslation.providerRevision ?? null,
        },
      ),
    );
  }
  for (const node of [...entry.contentNodes].sort(
    (left, right) => left.order - right.order,
  )) {
    const translation = firstExactRenderableNodeTranslationV1(
      node.translations,
      node.sourceTextFingerprint,
    );
    if (translation) {
      atoms.push(
        buildDisplayedTranslationAtomV1(
          node.contentNodeId,
          translation.text,
          {
            targetKind: "content-node",
            entryId: entry.entryId,
            contentNodeId: node.contentNodeId,
            translationId: translation.translationId,
            targetLanguageCode: translation.targetLanguageCode,
            sourceTextFingerprint: translation.sourceTextFingerprint,
            translationPolicyVersion: translation.translationPolicyVersion,
            providerRevision: translation.providerRevision ?? null,
          },
        ),
      );
    }
  }
  return atoms;
}

function buildDisplayedTranslationAtomV1(
  contentNodeId: string | null,
  text: string,
  artifact: DisplayedTranslationArtifactIdentityV1,
): DisplayedTranslationAtomV1 {
  const normalized = text.normalize("NFC");
  const bounded = truncateNfcText(normalized);
  return {
    role: "displayed-translation",
    contentNodeId,
    text: bounded.text,
    truncated: bounded.truncated,
    artifact,
  };
}

function truncateNfcText(text: string) {
  const encoder = new TextEncoder();
  const scalars = [...text];
  const kept: string[] = [];
  let bytes = 0;
  for (const scalar of scalars) {
    const scalarBytes = encoder.encode(scalar).byteLength;
    if (
      kept.length >= DISPLAYED_TRANSLATION_ATOM_MAX_SCALARS_V1 ||
      bytes + scalarBytes > DISPLAYED_TRANSLATION_ATOM_MAX_UTF8_BYTES_V1
    ) {
      break;
    }
    kept.push(scalar);
    bytes += scalarBytes;
  }
  return {
    text: kept.join(""),
    truncated: kept.length < scalars.length,
  };
}

function parseDisplayedTranslationAtomV1(
  input: unknown,
): DisplayedTranslationAtomV1 | null {
  if (
    !isRecord(input) ||
    Object.keys(input).sort().join("\0") !==
      ["artifact", "contentNodeId", "role", "text", "truncated"]
        .sort()
        .join("\0") ||
    input.role !== "displayed-translation" ||
    typeof input.text !== "string" ||
    typeof input.truncated !== "boolean"
  ) {
    return null;
  }
  const artifact = parseDisplayedTranslationArtifactIdentityV1(input.artifact);
  if (!artifact.ok || input.contentNodeId !== artifact.value.contentNodeId) {
    return null;
  }
  return {
    role: "displayed-translation",
    contentNodeId: artifact.value.contentNodeId,
    text: input.text,
    truncated: input.truncated,
    artifact: artifact.value,
  };
}

function canonicalJson(value: unknown) {
  return JSON.stringify(value, (_key, candidate) =>
    isRecord(candidate)
      ? Object.fromEntries(
          Object.entries(candidate).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : candidate,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
