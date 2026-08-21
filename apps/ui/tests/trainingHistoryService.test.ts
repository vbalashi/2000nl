import { beforeEach, describe, expect, test, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { rpc },
}));

const { fetchRecentTrainingHistory } = await import(
  "@/lib/training/trainingHistoryService"
);

describe("recent Training history", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  test("reads the authenticated server-owned projection and returns cap metadata", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          entry_id: "entry-1",
          headword: "bank",
          part_of_speech: "zn.",
          review_result: "review_success",
          card_type_id: "word-to-definition",
          reviewed_at: "2026-08-21T11:59:00.000Z",
          has_more: true,
        },
      ],
      error: null,
    });

    await expect(fetchRecentTrainingHistory()).resolves.toEqual({
      items: [
        {
          entryId: "entry-1",
          headword: "bank",
          partOfSpeech: "zn.",
          reviewResult: "review_success",
          cardTypeId: "word-to-definition",
          reviewedAt: "2026-08-21T11:59:00.000Z",
        },
      ],
      hasMore: true,
    });
    expect(rpc).toHaveBeenCalledWith("get_recent_training_review_history", {
      p_limit: 50,
    });
  });

  test("fails visibly instead of presenting a backend error as empty history", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "rpc unavailable" },
    });

    await expect(fetchRecentTrainingHistory()).rejects.toThrow(
      "training_history_failed",
    );
  });

  test("fails and diagnoses a malformed row instead of silently showing an empty history", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValueOnce({
      data: [{ entry_id: "entry-1", headword: "bank" }],
      error: null,
    });

    await expect(fetchRecentTrainingHistory()).rejects.toThrow(
      "training_history_contract_mismatch",
    );
    expect(diagnostic).toHaveBeenCalledWith(
      "Invalid recent training history projection",
      { index: 0 },
    );
    diagnostic.mockRestore();
  });

  test("rejects inconsistent truncation metadata", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const row = {
      entry_id: "entry-1",
      headword: "bank",
      part_of_speech: null,
      review_result: "review_success",
      card_type_id: "word-to-definition",
      reviewed_at: "2026-08-21T11:59:00.000Z",
      has_more: false,
    };
    rpc.mockResolvedValueOnce({
      data: [row, { ...row, entry_id: "entry-2", has_more: true }],
      error: null,
    });

    await expect(fetchRecentTrainingHistory()).rejects.toThrow(
      "training_history_contract_mismatch",
    );
    diagnostic.mockRestore();
  });
});
