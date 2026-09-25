import { beforeEach, expect, test, vi } from "vitest";
import { loadWordContextPrompt } from "@/lib/training/wordContextPrompt";
import { supabase } from "@/lib/supabaseClient";
import { loadSentenceExerciseContent } from "@/lib/training/sentenceExerciseLoader";

vi.mock("@/lib/supabaseClient", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/training/sentenceExerciseLoader", () => ({ loadSentenceExerciseContent: vi.fn() }));

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
