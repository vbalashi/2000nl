import { beforeEach, describe, expect, test, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    rpc,
  },
}));

const importService = async () => {
  const service = await import("@/lib/trainingService");
  return {
    fetchLastReviewDebug: service.fetchLastReviewDebug,
    recordDefinitionClick: service.recordDefinitionClick,
    recordWordView: service.recordWordView,
  };
};

describe("trainingService review side effects", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  test("recordWordView records last seen via RPC", async () => {
    const { recordWordView } = await importService();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    await recordWordView({
      userId: "user-1",
      wordId: "word-1",
      mode: "word-to-definition",
    });

    expect(rpc).toHaveBeenCalledWith("record_card_view", {
      p_user_id: "user-1",
      p_entry_id: "word-1",
      p_card_type_id: "word-to-definition",
    });
  });

  test("recordDefinitionClick skips missing word ids", async () => {
    const { recordDefinitionClick } = await importService();

    await recordDefinitionClick({
      userId: "user-1",
      wordId: null,
      mode: "definition-to-word",
    });

    expect(rpc).not.toHaveBeenCalled();
  });

  test("recordDefinitionClick is read-only and does not call mutation RPCs", async () => {
    const { recordDefinitionClick } = await importService();

    await recordDefinitionClick({
      userId: "user-1",
      wordId: "word-1",
      mode: "definition-to-word",
    });

    expect(rpc).not.toHaveBeenCalled();
  });

  test("fetchLastReviewDebug returns RPC data", async () => {
    const { fetchLastReviewDebug } = await importService();
    const debug = {
      reviewed_at: "2026-05-16T10:00:00.000Z",
      scheduled_at: "2026-05-17T10:00:00.000Z",
      review_type: "review",
      grade: 3,
      interval_after: 2,
      stability_before: 1,
      stability_after: 2,
      metadata: { retrievability: 0.9 },
    };
    rpc.mockResolvedValueOnce({ data: debug, error: null });

    await expect(
      fetchLastReviewDebug({
        userId: "user-1",
        wordId: "word-1",
        mode: "word-to-definition",
      }),
    ).resolves.toEqual(debug);
    expect(rpc).toHaveBeenCalledWith("get_last_review_debug", {
      p_user_id: "user-1",
      p_word_id: "word-1",
      p_mode: "word-to-definition",
    });
  });

  test("fetchLastReviewDebug returns null for missing optional RPC", async () => {
    const { fetchLastReviewDebug } = await importService();
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.get_last_review_debug",
      },
    });

    await expect(
      fetchLastReviewDebug({
        userId: "user-1",
        wordId: "word-1",
        mode: "word-to-definition",
      }),
    ).resolves.toBeNull();
  });
});
