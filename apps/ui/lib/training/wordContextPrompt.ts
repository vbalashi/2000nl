import { supabase } from "@/lib/supabaseClient";
import { loadSentenceExerciseContent, prepareSentenceExerciseTranslation } from "./sentenceExerciseLoader";
import { resolveSentencePrompt } from "./sentenceExerciseContent";
import { fetchTrainingSessionSnapshot } from "./selectionService";

export type WordContextPrompt = {
  text: string;
  sourceText: string;
  contentNodeId: string;
  sourceTextFingerprint: string;
};

export type WordContextLoadResult =
  | { state: "ready"; prompt: WordContextPrompt }
  | { state: "translation-pending" | "translation-unavailable" | "source-unavailable" };

/** This records display evidence only; the ordinary review remains the sole learning mutation. */
export async function markWordContextHintOpened(input: {
  userId: string; sessionId: string; entryId: string;
}): Promise<void> {
  const { error } = await supabase.rpc("mark_training_word_context_hint_opened", {
    p_user_id: input.userId,
    p_session_id: input.sessionId,
    p_entry_id: input.entryId,
  });
  if (error) throw error;
}

/** Warm only the next still-available member; the later normal load remains authoritative. */
export async function prepareNextWordContextTranslation(input: {
  userId: string; sessionId: string; entryId: string;
  contentLanguageCode: string; translationTargetLanguageCode: string;
  signal?: AbortSignal;
}): Promise<void> {
  const snapshot = await fetchTrainingSessionSnapshot(input.userId, input.sessionId);
  if (!snapshot || snapshot.runStatus === "superseded" || input.signal?.aborted) return;
  const current = snapshot.members.find((member) =>
    member.entryId === input.entryId && member.cardTypeId === "definition-to-word" &&
    !member.consumedAt && !member.unavailableAt);
  if (!current) return;
  const next = snapshot.members
    .filter((member) => member.ordinal > current.ordinal &&
      member.cardTypeId === "definition-to-word" &&
      !member.consumedAt && !member.unavailableAt)
    .sort((left, right) => left.ordinal - right.ordinal)[0];
  if (!next) return;
  const source = await readSource(input.userId, input.sessionId, next.entryId);
  if (!source || input.signal?.aborted) return;
  await prepareSentenceExerciseTranslation({
    entryId: next.entryId,
    contentNodeId: source.contentNodeId,
    contentLanguageCode: input.contentLanguageCode,
    translationTargetLanguageCode: input.translationTargetLanguageCode,
    signal: input.signal,
  });
}

async function readSource(userId: string, sessionId: string, entryId: string) {
  const { data, error } = await supabase.rpc("read_training_word_context_member", {
    p_user_id: userId, p_session_id: sessionId, p_entry_id: entryId,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const source = data as Record<string, unknown>;
  if (source.entryId !== entryId ||
      typeof source.contentNodeId !== "string" ||
      typeof source.sourceTextFingerprint !== "string") return null;
  return { contentNodeId: source.contentNodeId,
    sourceTextFingerprint: source.sourceTextFingerprint };
}

/** The DB latch owns example identity; translation preparation only fills its display layer. */
export async function loadWordContextPrompt(input: {
  userId: string;
  sessionId: string;
  entryId: string;
  contentLanguageCode: string;
  translationTargetLanguageCode: string;
  signal?: AbortSignal;
}): Promise<WordContextLoadResult> {
  const source = await readSource(input.userId, input.sessionId, input.entryId);
  if (input.signal?.aborted) return { state: "source-unavailable" };
  if (!source) return { state: "source-unavailable" };
  const loaded = await loadSentenceExerciseContent({
    candidate: {
      entryId: input.entryId,
      contentNodeId: source.contentNodeId,
      sourceTextFingerprint: source.sourceTextFingerprint,
    },
    contentLanguageCode: input.contentLanguageCode,
    translationTargetLanguageCode: input.translationTargetLanguageCode,
    signal: input.signal,
  });
  if (loaded.state === "translation-pending") return loaded;
  if (loaded.state === "translation-unavailable") return loaded;
  if (loaded.state !== "ready") return { state: "source-unavailable" };
  const prompt = resolveSentencePrompt(loaded.content, input.translationTargetLanguageCode);
  if (prompt.status !== "ready") return { state: "translation-pending" };
  return {
    state: "ready",
    prompt: {
      text: prompt.text,
      sourceText: loaded.content.sentence.text,
      contentNodeId: source.contentNodeId,
      sourceTextFingerprint: source.sourceTextFingerprint,
    },
  };
}
