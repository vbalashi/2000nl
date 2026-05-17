import { beforeEach, describe, expect, test, vi } from "vitest";

type QueryResponse = { data?: any; error?: any; count?: number };

type QueryRecord = {
  table: string;
  response: QueryResponse;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

const rpc = vi.fn();
const fromResponses = new Map<string, QueryResponse[]>();
const queries: QueryRecord[] = [];

const queueFrom = (table: string, response: QueryResponse) => {
  const queue = fromResponses.get(table) ?? [];
  queue.push(response);
  fromResponses.set(table, queue);
};

const createQuery = (table: string, response: QueryResponse): QueryRecord => {
  const query = {
    table,
    response,
  } as QueryRecord;

  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.gte = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(async () => response);
  (query as any).then = (resolve: any, reject: any) =>
    Promise.resolve(response).then(resolve, reject);

  queries.push(query);
  return query;
};

const from = vi.fn((table: string) => {
  const queue = fromResponses.get(table) ?? [];
  const response = queue.shift() ?? { data: null, error: null };
  fromResponses.set(table, queue);
  return createQuery(table, response);
});

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    rpc,
    from,
  },
}));

const importService = async () => {
  const service = await import("@/lib/trainingService");
  return {
    fetchRecentHistory: service.fetchRecentHistory,
    fetchStats: service.fetchStats,
  };
};

describe("trainingService stats and history", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockClear();
    fromResponses.clear();
    queries.length = 0;
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

  test("fetchRecentHistory hydrates status, meanings count, sources, results, and raw meaning id", async () => {
    const { fetchRecentHistory } = await importService();

    queueFrom("user_events", {
      data: [
        {
          word_id: "word-1",
          event_type: "review_success",
          mode: "word-to-definition",
          created_at: "2026-05-16T10:00:00.000Z",
          word: {
            id: "word-1",
            dictionary_id: "dict-1",
            language_code: "nl",
            headword: "huis",
            part_of_speech: "zn",
            gender: "het",
            raw: JSON.stringify({ meanings: [{ definition: "Een gebouw" }] }),
            is_nt2_2000: true,
            meaning_id: 2,
          },
        },
        {
          word_id: "word-2",
          event_type: "definition_click",
          mode: "definition-to-word",
          created_at: "2026-05-16T11:00:00.000Z",
          word: {
            id: "word-2",
            dictionary_id: "dict-1",
            language_code: "nl",
            headword: "lopen",
            part_of_speech: "ww",
            gender: null,
            raw: { meanings: [{ definition: "gaan" }], meaning_id: 4 },
            is_nt2_2000: false,
          },
        },
      ],
      error: null,
    });
    queueFrom("user_word_status", {
      data: [
        {
          word_id: "word-1",
          mode: "word-to-definition",
          click_count: 3,
          last_seen_at: "2026-05-16T12:00:00.000Z",
          fsrs_last_interval: 2,
          fsrs_reps: 5,
          fsrs_stability: 6.5,
          next_review_at: "2026-05-18T10:00:00.000Z",
        },
      ],
      error: null,
    });
    queueFrom("word_entries", { count: 2, error: null });
    queueFrom("word_entries", { count: 1, error: null });

    const history = await fetchRecentHistory("user-1");

    expect(queries[0].table).toBe("user_events");
    expect(queries[0].eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(queries[0].gte).toHaveBeenCalledWith(
      "created_at",
      expect.any(String),
    );
    expect(queries[0].limit).toHaveBeenCalledWith(50);
    expect(queries[1].in).toHaveBeenCalledWith("word_id", ["word-1", "word-2"]);
    expect(queries[2].eq).toHaveBeenCalledWith("headword", "huis");
    expect(queries[2].eq).toHaveBeenCalledWith("dictionary_id", "dict-1");
    expect(queries[3].eq).toHaveBeenCalledWith("headword", "lopen");
    expect(queries[3].eq).toHaveBeenCalledWith("dictionary_id", "dict-1");

    expect(history).toEqual([
      {
        id: "word-1",
        dictionary_id: "dict-1",
        language_code: "nl",
        headword: "huis",
        part_of_speech: "zn",
        gender: "het",
        raw: { meanings: [{ definition: "Een gebouw" }], meaning_id: 2 },
        is_nt2_2000: true,
        meanings_count: 2,
        source: "review",
        result: "success",
        stats: {
          click_count: 3,
          last_seen_at: "2026-05-16T12:00:00.000Z",
        },
        debugStats: {
          source: "review",
          mode: "word-to-definition",
          interval: 2,
          reps: 5,
          ef: 6.5,
          clicks: 3,
          next_review: "2026-05-18T10:00:00.000Z",
        },
      },
      {
        id: "word-2",
        dictionary_id: "dict-1",
        language_code: "nl",
        headword: "lopen",
        part_of_speech: "ww",
        gender: undefined,
        raw: { meanings: [{ definition: "gaan" }], meaning_id: 4 },
        is_nt2_2000: false,
        meanings_count: 1,
        source: "click",
        result: "neutral",
        stats: {
          click_count: 0,
          last_seen_at: "2026-05-16T11:00:00.000Z",
        },
        debugStats: {
          source: "click",
          mode: "definition-to-word",
          interval: undefined,
          reps: undefined,
          ef: undefined,
          clicks: undefined,
          next_review: undefined,
        },
      },
    ]);
  });
});
