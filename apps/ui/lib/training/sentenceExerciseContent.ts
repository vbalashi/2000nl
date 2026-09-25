import type {
  PlatformContentNodeV2,
  PlatformHeadwordGroupV2,
  PlatformSenseCardEntryV2,
  PlatformTranslationExerciseCandidateV2,
} from "../../../../packages/shared/types/platformV2";

export type SentenceExerciseContent = {
  group: PlatformHeadwordGroupV2;
  entry: PlatformSenseCardEntryV2;
  sentence: PlatformContentNodeV2;
};

/** Eligibility belongs to the server; this checks the exact selected source. */
export function resolveSentenceExerciseContent(
  target: Pick<PlatformTranslationExerciseCandidateV2,
    "entryId" | "contentNodeId" | "sourceTextFingerprint">,
  group: PlatformHeadwordGroupV2,
): SentenceExerciseContent | null {
  const entries = group.entries.filter(
    (entry): entry is PlatformSenseCardEntryV2 =>
      entry.kind === "sense-card" && entry.entryId === target.entryId,
  );
  if (entries.length !== 1) return null;
  const entry = entries[0];
  const matches = entry.contentNodes.filter(
    (node) => node.contentNodeId === target.contentNodeId,
  );
  if (matches.length !== 1) return null;
  const sentence = matches[0];
  if (sentence.kind !== "example" || !sentence.text.trim() ||
      sentence.sourceTextFingerprint !== target.sourceTextFingerprint) return null;
  return { group, entry, sentence };
}

export type SentencePromptReadiness =
  | { status: "ready"; text: string; translationId: string }
  | { status: "missing" | "pending" | "failed" | "not-available" | "ambiguous" };

/** Only a current translation of this example in the requested language is a prompt. */
export function resolveSentencePrompt(
  content: SentenceExerciseContent,
  targetLanguageCode: string,
): SentencePromptReadiness {
  const matches = content.sentence.translations.filter(
    (translation) => translation.targetLanguageCode === targetLanguageCode &&
      translation.sourceTextFingerprint === content.sentence.sourceTextFingerprint,
  );
  if (matches.length === 0) return { status: "missing" };
  if (matches.length !== 1) return { status: "ambiguous" };
  const translation = matches[0];
  if (translation.status !== "ready") return { status: translation.status };
  if (!translation.text?.trim()) return { status: "missing" };
  return { status: "ready", text: translation.text, translationId: translation.translationId };
}
