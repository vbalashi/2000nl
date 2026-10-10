import type { PlatformSenseCardEntryV2 } from "../../../../packages/shared/types/platformV2";
import type { IdiomExerciseContent } from "./idiomExerciseContent";
import { isExactRenderableEntryTranslationV1 } from "../../../../packages/shared/platform-v2/displayedTranslationArtifactIdentityV1";

function hasStandaloneMeaning(entry: PlatformSenseCardEntryV2) {
  return entry.contentNodes.some(
    (node) => node.parentContentNodeId === null &&
      (node.kind === "definition" || node.kind === "usage-pattern") &&
      Boolean(node.text.trim()),
  );
}

/** An idiom-only sense has no word translation; use the dictionary's first
 * standalone sense of the same part of speech, never the first cached result. */
export function idiomHeadwordTranslation(
  content: IdiomExerciseContent,
  targetLanguageCode: string | null,
): { text: string; alternatives: string[] } | null {
  if (!targetLanguageCode) return null;
  const partOfSpeech = (entry: PlatformSenseCardEntryV2) =>
    (entry.partOfSpeech ?? content.group.header.partOfSpeech)?.termId;
  const entry = hasStandaloneMeaning(content.entry)
    ? content.entry
    : content.group.entries
        .filter((candidate): candidate is PlatformSenseCardEntryV2 =>
          candidate.kind === "sense-card" &&
          candidate.meaningOrdinal !== null &&
          partOfSpeech(candidate) === partOfSpeech(content.entry) &&
          hasStandaloneMeaning(candidate),
        )
        .sort((left, right) => left.meaningOrdinal! - right.meaningOrdinal!)[0];
  if (!entry) return null;
  const translation = entry.translation;
  if (
    !isExactRenderableEntryTranslationV1(translation, {
      entryId: entry.entryId,
      sourceContentFingerprint: entry.contentRevision,
    }) ||
    translation.targetLanguageCode !== targetLanguageCode
  ) return null;
  // baseText is explicitly context-free. Alternatives belong to primaryText
  // and must not be attached to a different base rendering.
  const baseText = translation.baseText?.trim();
  return {
    text: baseText || translation.text,
    alternatives: baseText && baseText !== translation.text
      ? [] : translation.alternativeTexts ?? [],
  };
}
