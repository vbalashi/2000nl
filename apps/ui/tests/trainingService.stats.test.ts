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
    fetchStats: service.fetchStats,
  };
};

describe("trainingService stats", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  test("fetchStats forwards modes and list scope and maps missing values to defaults", async () => {
    const { fetchStats } = await importService();
    rpc.mockResolvedValueOnce({
      data: {
        newCardsToday: 4,
        reviewCardsDone: 5,
        reviewCardsDue: 6,
        totalWordsLearned: 7,
      },
      error: null,
    });

    await expect(
      fetchStats(
        "user-1",
        ["word-to-definition", "definition-to-word"],
        { listId: "list-1", listType: "user" },
      ),
    ).resolves.toEqual({
      newWordsToday: 0,
      newCardsToday: 4,
      dailyNewLimit: 10,
      reviewWordsDone: 0,
      reviewCardsDone: 5,
      reviewWordsDue: 0,
      reviewCardsDue: 6,
      totalWordsLearned: 7,
      totalWordsInList: 2000,
    });
    expect(rpc).toHaveBeenCalledWith("get_detailed_training_stats", {
      p_user_id: "user-1",
      p_modes: ["word-to-definition", "definition-to-word"],
      p_list_id: "list-1",
      p_list_type: "user",
    });
  });

  test("fetchStats returns conservative defaults on RPC error", async () => {
    const { fetchStats } = await importService();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });

    await expect(fetchStats("user-1", ["word-to-definition"])).resolves.toEqual(
      {
        newWordsToday: 0,
        newCardsToday: 0,
        dailyNewLimit: 10,
        reviewWordsDone: 0,
        reviewCardsDone: 0,
        reviewWordsDue: 0,
        reviewCardsDue: 0,
        totalWordsLearned: 0,
        totalWordsInList: 2000,
      },
    );
  });
});
