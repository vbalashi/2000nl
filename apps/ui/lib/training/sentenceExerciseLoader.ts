import {readCurrentTrainingCard,type CurrentTrainingCardContext} from "@/lib/platform/trainingCurrentCardClient";
import type { PlatformTranslationExerciseCandidateV2 } from "../../../../packages/shared/types/platformV2";
import { fetchPlatformV2LibraryGroup, PlatformV2LibraryLookupError, requestPlatformV2LibraryTranslation } from "@/lib/platform/platformV2LibraryClient";
import { resolveSentenceExerciseContent, resolveSentencePrompt, type SentenceExerciseContent } from "./sentenceExerciseContent";

export type SentenceExerciseLoadResult =
  | { state: "ready"; content: SentenceExerciseContent }
  | { state: "translation-pending" | "translation-unavailable" }
  | { state: "projection-missing" | "dictionary-access-revoked" | "entry-not-found" };

export type SentenceTranslationPreparationResult =
  | { state: "ready" | "translation-pending" | "translation-unavailable" }
  | { state: "projection-missing" | "dictionary-access-revoked" | "entry-not-found" };

/**
 * Warms exactly one latched session member without advancing the session or
 * touching learning state. The normal loader revalidates target identity after
 * the current action is accepted.
 */
export async function prepareSentenceExerciseTranslation(input: {
  entryId: string;
  contentNodeId: string;
  contentLanguageCode: string;
  translationTargetLanguageCode: string;
  signal?: AbortSignal;
  force?: boolean;
}): Promise<SentenceTranslationPreparationResult> {
  try {
    const group = await fetchPlatformV2LibraryGroup({
      entryId: input.entryId,
      cardTypeId: "word-to-definition",
      contentLanguageCode: input.contentLanguageCode,
      translationTargetLanguageCode: input.translationTargetLanguageCode,
      signal: input.signal,
    });
    if (!group) return { state: "entry-not-found" };
    const entry = group.entries.find(
      (item) => item.kind === "sense-card" && item.entryId === input.entryId,
    );
    if (!entry || entry.kind !== "sense-card") return { state: "projection-missing" };
    const sentence = entry.contentNodes.find(
      (node) => node.contentNodeId === input.contentNodeId,
    );
    if (!sentence || sentence.kind !== "example" || !sentence.text.trim()) {
      return { state: "projection-missing" };
    }
    const ready = sentence.translations.some(
      (translation) =>
        translation.targetLanguageCode === input.translationTargetLanguageCode &&
        translation.status === "ready" &&
        Boolean(translation.text?.trim()) &&
        translation.sourceTextFingerprint === sentence.sourceTextFingerprint,
    );
    const capability = entry.capabilities?.find(
      (item) =>
        item.actionId === "request-translation" &&
        item.target.entryId === input.entryId &&
        item.targetLanguageCode === input.translationTargetLanguageCode,
    );
    if (ready && !capability) return { state: "ready" };
    if (!capability || capability.actionId !== "request-translation") {
      return { state: "translation-unavailable" };
    }
    const result = await requestPlatformV2LibraryTranslation({
      entryId: input.entryId,
      targetLanguageCode: input.translationTargetLanguageCode,
      background: true,
      ...(input.signal ? {signal:input.signal} : {}),
    });
    return { state: result === "ready" ? "ready" : result === "failed" ? "translation-unavailable" : "translation-pending" };
  } catch (error) {
    if (error instanceof PlatformV2LibraryLookupError) {
      if (error.status === 403) return { state: "dictionary-access-revoked" };
      if (error.status === 404) return { state: "entry-not-found" };
      if (error.status === 409) return { state: "projection-missing" };
    }
    throw error;
  }
}

/** Reads exactly the scheduled source node; generation never changes its identity. */
export async function loadSentenceExerciseContent(input: {
  userId?:string;
  currentCard?:CurrentTrainingCardContext;
  candidate: Pick<PlatformTranslationExerciseCandidateV2, "entryId" | "contentNodeId" | "sourceTextFingerprint">;
  contentLanguageCode: string;
  translationTargetLanguageCode: string;
  signal?: AbortSignal;
  force?: boolean;
}): Promise<SentenceExerciseLoadResult> {
  try {
    const readGroup=async()=>{
      if(input.currentCard){
        if(!input.userId)throw new Error("current_card_owner_required");
        return (await readCurrentTrainingCard(input.userId,{...input.currentCard,entryId:input.candidate.entryId,cardTypeId:"word-to-definition",contentLanguageCode:input.contentLanguageCode,translationTargetLanguageCode:input.translationTargetLanguageCode},input.signal)).groups[0];
      }
      return fetchPlatformV2LibraryGroup({
      entryId: input.candidate.entryId,
      cardTypeId: "word-to-definition",
      contentLanguageCode: input.contentLanguageCode,
      translationTargetLanguageCode: input.translationTargetLanguageCode,
      signal: input.signal,
      });
    };
    let group = await readGroup();
    if (!group) return { state: "entry-not-found" };
    let content = resolveSentenceExerciseContent(input.candidate, group);
    if (!content) return { state: "projection-missing" };
    const capability = content.entry.capabilities?.find(
        (item) => item.actionId === "request-translation" && item.target.entryId === input.candidate.entryId && item.targetLanguageCode === input.translationTargetLanguageCode,
      );
    if (resolveSentencePrompt(content, input.translationTargetLanguageCode).status !== "ready" || capability) {
      if (!capability || capability.actionId !== "request-translation") return { state: "translation-unavailable" };
      const result = await requestPlatformV2LibraryTranslation({ entryId: input.candidate.entryId, targetLanguageCode: input.translationTargetLanguageCode, force: input.force, ...(input.currentCard ? {currentCard:input.currentCard} : {}), ...(input.signal ? {signal:input.signal} : {}) });
      if (result !== "ready") return { state: result === "failed" ? "translation-unavailable" : "translation-pending" };
      group = await readGroup();
      if (!group) return { state: "entry-not-found" };
      content = resolveSentenceExerciseContent(input.candidate, group);
      if (!content) return { state: "projection-missing" };
      if (resolveSentencePrompt(content, input.translationTargetLanguageCode).status !== "ready" || content.entry.capabilities.some(
        item => item.actionId === "request-translation" && item.targetLanguageCode === input.translationTargetLanguageCode,
      )) return { state: "translation-pending" };
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
