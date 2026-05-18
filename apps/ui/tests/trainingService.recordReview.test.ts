import { beforeEach, describe, expect, test, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    rpc,
  },
}));

describe("trainingService.recordReview turnId forwarding", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  test("includes p_turn_id when turnId is provided", async () => {
    const { recordReview } = await import("@/lib/trainingService");

    rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          fsrs_last_interval: 3,
          fsrs_reps: 2,
          fsrs_stability: 1.23,
          click_count: 0,
          next_review_at: "2026-02-09T00:00:00.000Z",
          in_learning: false,
          learning_due_at: null,
        },
        error: null,
      });

    await recordReview({
      userId: "user-1",
      wordId: "word-1",
      mode: "word-to-definition",
      result: "success",
      turnId: "turn-123",
    });

    expect(rpc).toHaveBeenCalledWith(
      "handle_card_review",
      expect.objectContaining({ p_turn_id: "turn-123" })
    );
    expect(rpc).toHaveBeenCalledWith("get_user_card_state", {
      p_user_id: "user-1",
      p_entry_id: "word-1",
      p_card_type_id: "word-to-definition",
    });
  });

  test("uses card review RPC when turnId is not provided", async () => {
    const { recordReview } = await import("@/lib/trainingService");

    rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          fsrs_last_interval: null,
          fsrs_reps: null,
          fsrs_stability: null,
          click_count: null,
          next_review_at: null,
          in_learning: null,
          learning_due_at: null,
        },
        error: null,
      });

    await recordReview({
      userId: "user-1",
      wordId: "word-1",
      mode: "word-to-definition",
      result: "success",
    });

    expect(rpc).toHaveBeenCalledWith(
      "handle_card_review",
      expect.objectContaining({ p_turn_id: null })
    );
    expect(rpc).toHaveBeenCalledWith("get_user_card_state", {
      p_user_id: "user-1",
      p_entry_id: "word-1",
      p_card_type_id: "word-to-definition",
    });
  });

  test("falls back to legacy review RPC when card wrapper is missing", async () => {
    const { recordReview } = await import("@/lib/trainingService");

    rpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Could not find the function public.handle_card_review", code: "PGRST202" },
      })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          fsrs_last_interval: 1,
          fsrs_reps: 1,
          fsrs_stability: 0.5,
          click_count: 0,
          next_review_at: "2026-02-09T00:00:00.000Z",
          in_learning: false,
          learning_due_at: null,
        },
        error: null,
      });

    await recordReview({
      userId: "user-1",
      wordId: "word-1",
      mode: "word-to-definition",
      result: "success",
      turnId: "turn-legacy",
    });

    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls[0]?.[0]).toBe("handle_card_review");
    expect(rpc.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ p_turn_id: "turn-legacy" })
    );
    expect(rpc.mock.calls[1]?.[0]).toBe("handle_review");
    expect(rpc.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ p_turn_id: "turn-legacy" })
    );
    expect(rpc.mock.calls[2]?.[0]).toBe("get_user_card_state");
  });
});
