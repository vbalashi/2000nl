import { supabase } from "@/lib/supabaseClient";
import { loadSentenceExerciseContent } from "./sentenceExerciseLoader";
import { resolveSentencePrompt } from "./sentenceExerciseContent";

export type WordContextPrompt = {
  text: string;
  sourceText: string;
  contentNodeId: string;
};

export type WordContextLoadResult =
  | { state: "ready"; prompt: WordContextPrompt }
  | { state: "translation-pending" | "translation-unavailable" | "source-unavailable" };

/** The DB latch owns example identity; translation preparation only fills its display layer. */
export async function loadWordContextPrompt(input: {
  userId: string;
  sessionId: string;
  entryId: string;
  contentLanguageCode: string;
  translationTargetLanguageCode: string;
  signal?: AbortSignal;
}): Promise<WordContextLoadResult> {
  const { data, error } = await supabase.rpc("read_training_word_context_member", {
    p_user_id: input.userId,
    p_session_id: input.sessionId,
    p_entry_id: input.entryId,
  });
  if (error) throw error;
  if (input.signal?.aborted) return { state: "source-unavailable" };
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { state: "source-unavailable" };
  }
  const source = data as Record<string, unknown>;
  if (source.entryId !== input.entryId ||
      typeof source.contentNodeId !== "string" ||
      typeof source.sourceTextFingerprint !== "string") {
    return { state: "source-unavailable" };
  }
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
    },
  };
}
