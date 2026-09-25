import type { PlatformTranslationExerciseCandidateV2 } from "../../../../packages/shared/types/platformV2";
import { fetchPlatformV2LibraryGroup, PlatformV2LibraryLookupError, requestPlatformV2LibraryTranslation } from "@/lib/platform/platformV2LibraryClient";
import { resolveSentenceExerciseContent, resolveSentencePrompt, type SentenceExerciseContent } from "./sentenceExerciseContent";

export type SentenceExerciseLoadResult =
  | { state: "ready"; content: SentenceExerciseContent }
  | { state: "translation-pending" | "translation-unavailable" }
  | { state: "projection-missing" | "dictionary-access-revoked" | "entry-not-found" };

/** Reads exactly the scheduled source node; generation never changes its identity. */
export async function loadSentenceExerciseContent(input: {
  candidate: PlatformTranslationExerciseCandidateV2;
  contentLanguageCode: string;
  translationTargetLanguageCode: string;
  signal?: AbortSignal;
}): Promise<SentenceExerciseLoadResult> {
  try {
    let group = await fetchPlatformV2LibraryGroup({
      entryId: input.candidate.entryId,
      cardTypeId: "word-to-definition",
      contentLanguageCode: input.contentLanguageCode,
      translationTargetLanguageCode: input.translationTargetLanguageCode,
      signal: input.signal,
    });
    if (!group) return { state: "entry-not-found" };
    let content = resolveSentenceExerciseContent(input.candidate, group);
    if (!content) return { state: "projection-missing" };
    if (resolveSentencePrompt(content, input.translationTargetLanguageCode).status !== "ready") {
      const capability = content.entry.capabilities?.find(
        (item) => item.actionId === "request-translation" && item.target.entryId === input.candidate.entryId && item.targetLanguageCode === input.translationTargetLanguageCode,
      );
      if (!capability || capability.actionId !== "request-translation") return { state: "translation-unavailable" };
      const result = await requestPlatformV2LibraryTranslation({ entryId: input.candidate.entryId, targetLanguageCode: input.translationTargetLanguageCode });
      if (result !== "ready") return { state: "translation-pending" };
      group = await fetchPlatformV2LibraryGroup({
        entryId: input.candidate.entryId,
        cardTypeId: "word-to-definition",
        contentLanguageCode: input.contentLanguageCode,
        translationTargetLanguageCode: input.translationTargetLanguageCode,
        signal: input.signal,
      });
      if (!group) return { state: "entry-not-found" };
      content = resolveSentenceExerciseContent(input.candidate, group);
      if (!content) return { state: "projection-missing" };
      if (resolveSentencePrompt(content, input.translationTargetLanguageCode).status !== "ready") return { state: "translation-pending" };
    }
    return { state: "ready", content };
  } catch (error) {
    if (error instanceof PlatformV2LibraryLookupError) {
      if (error.status === 403) return { state: "dictionary-access-revoked" };
      if (error.status === 404) return { state: "entry-not-found" };
      if (error.status === 409) return { state: "projection-missing" };
    }
    throw error;
  }
}
