import { beforeEach, expect, test, vi } from "vitest";
import { loadWordContextPrompt, markWordContextHintOpened, prepareNextWordContextTranslation } from "@/lib/training/wordContextPrompt";
import { supabase } from "@/lib/supabaseClient";
import { loadSentenceExerciseContent, prepareSentenceExerciseTranslation } from "@/lib/training/sentenceExerciseLoader";
import { fetchTrainingSessionSnapshot } from "@/lib/training/selectionService";

vi.mock("@/lib/supabaseClient", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/training/sentenceExerciseLoader", () => ({
  loadSentenceExerciseContent: vi.fn(), prepareSentenceExerciseTranslation: vi.fn(),
}));
vi.mock("@/lib/training/selectionService", () => ({ fetchTrainingSessionSnapshot: vi.fn() }));

const input = {
  userId: "user-id",
  sessionId: "session-id",
  entryId: "entry-id",
  contentLanguageCode: "nl",
  translationTargetLanguageCode: "ru",
};

beforeEach(() => { vi.clearAllMocks(); });

test("context prompt reads the latched node and its exact translation", async () => {
  vi.mocked(supabase.rpc).mockResolvedValue({ data: {
    entryId: "entry-id", contentNodeId: "example-a", sourceTextFingerprint: "fingerprint-a",
  }, error: null } as never);
  vi.mocked(loadSentenceExerciseContent).mockResolvedValue({ state: "ready", content: {
    group: {} as never, entry: {} as never,
    sentence: {
      text: "Ik ken dit woord.",
      sourceTextFingerprint: "fingerprint-a",
      translations: [{ targetLanguageCode: "ru", sourceTextFingerprint: "fingerprint-a",
        status: "ready", text: "Я знаю это слово.", translationId: "translation-a" }],
    } as never,
  } });
  await expect(loadWordContextPrompt(input)).resolves.toEqual({ state: "ready", prompt: {
    text: "Я знаю это слово.", sourceText: "Ik ken dit woord.", contentNodeId: "example-a",
    sourceTextFingerprint: "fingerprint-a",
  } });
  expect(loadSentenceExerciseContent).toHaveBeenCalledWith(expect.objectContaining({
    candidate: { entryId: "entry-id", contentNodeId: "example-a", sourceTextFingerprint: "fingerprint-a" },
  }));
});

test("context prompt never substitutes another example if the server source is unavailable", async () => {
  vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
  await expect(loadWordContextPrompt(input)).resolves.toEqual({ state: "source-unavailable" });
  expect(loadSentenceExerciseContent).not.toHaveBeenCalled();
});

test("hint evidence uses the same session and exact meaning identity", async () => {
  vi.mocked(supabase.rpc).mockResolvedValue({ data: true, error: null } as never);
  await markWordContextHintOpened({ userId: input.userId,
    sessionId: input.sessionId, entryId: input.entryId });
  expect(supabase.rpc).toHaveBeenCalledWith("mark_training_word_context_hint_opened", {
    p_user_id: input.userId, p_session_id: input.sessionId, p_entry_id: input.entryId,
  });
});

test("lookahead warms only the next member's frozen example", async () => {
  vi.mocked(fetchTrainingSessionSnapshot).mockResolvedValue({
    runStatus: "active",
    members: [
      { ordinal: 1, entryId: "entry-id", cardTypeId: "definition-to-word", consumedAt: null, unavailableAt: null },
      { ordinal: 2, entryId: "next-entry", cardTypeId: "definition-to-word", consumedAt: null, unavailableAt: null },
      { ordinal: 3, entryId: "later-entry", cardTypeId: "definition-to-word", consumedAt: null, unavailableAt: null },
    ],
  } as never);
  vi.mocked(supabase.rpc).mockResolvedValue({ data: {
    entryId: "next-entry", contentNodeId: "next-example", sourceTextFingerprint: "next-fingerprint",
  }, error: null } as never);
  vi.mocked(prepareSentenceExerciseTranslation).mockResolvedValue({ state: "ready" });
  await prepareNextWordContextTranslation(input);
  expect(supabase.rpc).toHaveBeenCalledWith("read_training_word_context_member",
    expect.objectContaining({ p_entry_id: "next-entry" }));
  expect(prepareSentenceExerciseTranslation).toHaveBeenCalledOnce();
  expect(prepareSentenceExerciseTranslation).toHaveBeenCalledWith(expect.objectContaining({
    entryId: "next-entry", contentNodeId: "next-example",
  }));
});
