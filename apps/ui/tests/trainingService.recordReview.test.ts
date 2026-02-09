import { beforeEach, describe, expect, test, vi } from "vitest";

const rpc = vi.fn();
const maybeSingle = vi.fn();

type Query = {
  select: (...args: any[]) => Query;
  eq: (...args: any[]) => Query;
  maybeSingle: (...args: any[]) => Promise<{ data: any; error: any }>;
};

// Build the chainable query object without a self-referential initializer.
const query = {} as Query;
const selectMock = vi.fn(() => query);
const eqMock = vi.fn(() => query);
query.select = selectMock as unknown as Query["select"];
query.eq = eqMock as unknown as Query["eq"];
query.maybeSingle = maybeSingle as unknown as Query["maybeSingle"];

const from = vi.fn(() => query);

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    rpc,
    from,
  },
}));

describe("trainingService.recordReview turnId forwarding", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockClear();
    selectMock.mockClear();
    eqMock.mockClear();
    maybeSingle.mockReset();
  });

  test("includes p_turn_id when turnId is provided", async () => {
    const { recordReview } = await import("@/lib/trainingService");

    rpc.mockResolvedValueOnce({ data: null, error: null });
    maybeSingle.mockResolvedValueOnce({
      data: {
        fsrs_last_interval: 3,
        fsrs_reps: 2,
        fsrs_stability: 1.23,
        click_count: 0,
        next_review_at: "2026-02-09T00:00:00.000Z",
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
      "handle_review",
      expect.objectContaining({ p_turn_id: "turn-123" })
    );
  });

  test("uses legacy signature when turnId is not provided", async () => {
    const { recordReview } = await import("@/lib/trainingService");

    rpc.mockResolvedValueOnce({ data: null, error: null });
    maybeSingle.mockResolvedValueOnce({
      data: {
        fsrs_last_interval: null,
        fsrs_reps: null,
        fsrs_stability: null,
        click_count: null,
        next_review_at: null,
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
      "handle_review",
      expect.not.objectContaining({ p_turn_id: expect.anything() })
    );
  });

  test("falls back to legacy signature when backend rejects p_turn_id", async () => {
    const { recordReview } = await import("@/lib/trainingService");

    rpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Could not find the function public.handle_review(p_turn_id)", code: "PGRST202" },
      })
      .mockResolvedValueOnce({ data: null, error: null });

    maybeSingle.mockResolvedValueOnce({
      data: {
        fsrs_last_interval: 1,
        fsrs_reps: 1,
        fsrs_stability: 0.5,
        click_count: 0,
        next_review_at: "2026-02-09T00:00:00.000Z",
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

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]?.[0]).toBe("handle_review");
    expect(rpc.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ p_turn_id: "turn-legacy" })
    );
    expect(rpc.mock.calls[1]?.[0]).toBe("handle_review");
    expect(rpc.mock.calls[1]?.[1]).toEqual(
      expect.not.objectContaining({ p_turn_id: expect.anything() })
    );
  });
});
