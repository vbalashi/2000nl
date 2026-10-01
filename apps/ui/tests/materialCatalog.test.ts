import { afterEach, expect, test, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { rpc } }));
import {
  fetchAvailableDictionarySources,
  fetchAvailableDictionarySourcesStrict,
  fetchAvailableLearningLanguages,
} from "@/lib/training/listService";
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
test("settings reject catalog failure while the legacy selector retains its fallback", async () => {
  const failure = { message: "unavailable" };
  rpc.mockResolvedValue({ data: null, error: failure });
  vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(
    fetchAvailableDictionarySourcesStrict({ userId: "a", languageCode: "nl" }),
  ).rejects.toEqual(failure);
  await expect(
    fetchAvailableDictionarySources({ userId: "a", languageCode: "nl" }),
  ).resolves.toEqual([]);
});
test("bounded catalog reads pass cancellation and the requested principal to the existing RPC", async () => {
  const controller = new AbortController();
  const abortSignal = vi.fn().mockResolvedValue({ data: [], error: null });
  rpc.mockReturnValue({ abortSignal });
  await fetchAvailableDictionarySourcesStrict(
    { userId: "a", languageCode: "nl" },
    controller.signal,
  );
  expect(rpc).toHaveBeenCalledWith("get_available_dictionary_sources", {
    p_user_id: "a",
    p_language_code: "nl",
  });
  expect(abortSignal).toHaveBeenCalledWith(controller.signal);
  await fetchAvailableLearningLanguages("a", controller.signal);
  expect(rpc).toHaveBeenCalledWith("get_available_learning_languages", {
    p_user_id: "a",
  });
});
test("malformed catalog data is not treated as a successful empty inventory", async () => {
  rpc.mockResolvedValue({ data: {}, error: null });
  await expect(
    fetchAvailableDictionarySourcesStrict({ userId: "a", languageCode: "nl" }),
  ).rejects.toThrow("dictionary_sources_unavailable");
});
