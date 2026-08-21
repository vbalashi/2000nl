import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("reads the authenticated 24-hour history boundary and projects only display fields", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "entry-1",
          headword: "bank",
          part_of_speech: "zn.",
          event_type: "review_success",
          mode: "word-to-definition",
          created_at: "2026-08-21T11:59:00.000Z",
          raw: { mustNotLeakIntoView: true },
        },
      ],
      error: null,
    });

    await expect(fetchRecentTrainingHistory("user-1")).resolves.toEqual([
      {
        entryId: "entry-1",
        headword: "bank",
        partOfSpeech: "zn.",
        eventType: "review_success",
        mode: "word-to-definition",
        createdAt: "2026-08-21T11:59:00.000Z",
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_recent_training_history", {
      p_user_id: "user-1",
      p_since: "2026-08-20T12:00:00.000Z",
      p_limit: 50,
    });
  });

  test("fails visibly instead of presenting a backend error as empty history", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "rpc unavailable" },
    });

    await expect(fetchRecentTrainingHistory("user-1")).rejects.toThrow(
      "training_history_failed",
    );
  });
});
