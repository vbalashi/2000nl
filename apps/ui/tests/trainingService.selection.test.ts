import { beforeEach, describe, expect, test, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    rpc,
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

const importService = async () => {
  const service = await import("@/lib/trainingService");
  return {
    fetchNextTrainingWord: service.fetchNextTrainingWord,
    fetchNextTrainingWordByScenario: service.fetchNextTrainingWordByScenario,
  };
};

describe("trainingService next-word selection", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  test("fetchNextTrainingWord forwards modes, list scope, card filter, queue turn, and excludes", async () => {
    const { fetchNextTrainingWord } = await importService();

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "word-1",
          headword: "huis",
          part_of_speech: "zn",
          gender: "het",
          raw: { meanings: [{ definition: "Een gebouw" }] },
          is_nt2_2000: true,
          meanings_count: 1,
          mode: "definition-to-word",
          stats: {
            source: "review",
            mode: "definition-to-word",
            stability: 4.25,
          },
        },
      ],
      error: null,
    });

    const word = await fetchNextTrainingWord(
      "user-1",
      ["word-to-definition", "definition-to-word"],
      ["skip-1"],
      { listId: "list-1", listType: "user" },
      "review",
      "review",
    );

    expect(rpc).toHaveBeenCalledWith("get_next_word", {
      p_user_id: "user-1",
      p_modes: ["word-to-definition", "definition-to-word"],
      p_exclude_ids: ["skip-1"],
      p_card_filter: "review",
      p_queue_turn: "review",
      p_list_id: "list-1",
      p_list_type: "user",
    });
    expect(word).toEqual(
      expect.objectContaining({
        id: "word-1",
        headword: "huis",
        part_of_speech: "zn",
        gender: "het",
        is_nt2_2000: true,
        meanings_count: 1,
        isFirstEncounter: false,
        mode: "definition-to-word",
        debugStats: expect.objectContaining({
          source: "review",
          mode: "definition-to-word",
          stability: 4.25,
          ef: 4.25,
        }),
      }),
    );
  });

  test("fetchNextTrainingWordByScenario forwards scenario id and forces first encounters to W->D mode", async () => {
    const { fetchNextTrainingWordByScenario } = await importService();

    rpc.mockResolvedValueOnce({
      data: {
        id: "word-new",
        headword: "nieuw",
        raw: JSON.stringify({ meanings: [{ definition: "pas gemaakt" }] }),
        mode: "definition-to-word",
        stats: {
          source: "new",
          mode: "definition-to-word",
          stability: 0.1,
        },
      },
      error: null,
    });

    const word = await fetchNextTrainingWordByScenario(
      "user-1",
      "understanding",
      ["already-seen"],
      { listId: "list-1", listType: "curated" },
      "both",
      "new",
    );

    expect(rpc).toHaveBeenCalledWith("get_next_word", {
      p_user_id: "user-1",
      p_scenario_id: "understanding",
      p_exclude_ids: ["already-seen"],
      p_card_filter: "both",
      p_queue_turn: "new",
      p_list_id: "list-1",
      p_list_type: "curated",
    });
    expect(word).toEqual(
      expect.objectContaining({
        id: "word-new",
        headword: "nieuw",
        raw: { meanings: [{ definition: "pas gemaakt" }] },
        isFirstEncounter: true,
        mode: "word-to-definition",
        debugStats: expect.objectContaining({
          source: "new",
          stability: 0.1,
          ef: 0.1,
        }),
      }),
    );
  });

  test("selection skips cross-reference-only rows and retries with the skipped id excluded", async () => {
    const { fetchNextTrainingWordByScenario } = await importService();
    const payloads: any[] = [];

    rpc
      .mockImplementationOnce(async (_fn, payload) => {
        payloads.push(structuredClone(payload));
        return {
          data: [
            {
              id: "cross-ref",
              headword: "zie",
              raw: { cross_reference: "huis", meanings: [] },
              stats: { source: "review" },
            },
          ],
          error: null,
        };
      })
      .mockImplementationOnce(async (_fn, payload) => {
        payloads.push(structuredClone(payload));
        return {
          data: [
            {
              id: "word-2",
              headword: "lopen",
              raw: { meanings: [{ definition: "gaan" }] },
              mode: "word-to-definition",
              stats: { source: "review", mode: "word-to-definition" },
            },
          ],
          error: null,
        };
      });

    const word = await fetchNextTrainingWordByScenario(
      "user-1",
      "understanding",
      ["initial-skip"],
    );

    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      "get_next_word",
      "get_next_word",
    ]);
    expect(payloads).toEqual([
      expect.objectContaining({ p_exclude_ids: ["initial-skip"] }),
      expect.objectContaining({
        p_exclude_ids: ["initial-skip", "cross-ref"],
      }),
    ]);
    expect(word?.id).toBe("word-2");
  });

  test("legacy selection falls back to list words when RPC returns no data", async () => {
    const { fetchNextTrainingWord } = await importService();

    rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "fallback-word",
              headword: "reserve",
              part_of_speech: "zn",
              gender: "de",
              raw: { meanings: [{ definition: "iets achter de hand" }] },
              is_nt2_2000: false,
              meanings_count: 2,
            },
          ],
          total: 1,
          is_locked: false,
          max_allowed: null,
        },
        error: null,
      });

    const word = await fetchNextTrainingWord(
      "user-1",
      ["definition-to-word"],
      ["already-used"],
      { listId: "list-1", listType: "curated" },
      "both",
      "auto",
    );

    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "fetch_words_for_list_gated",
      expect.objectContaining({
        p_list_id: "list-1",
        p_list_type: "curated",
        p_page: 1,
        p_page_size: 50,
      }),
    );
    expect(word).toEqual(
      expect.objectContaining({
        id: "fallback-word",
        headword: "reserve",
        mode: "definition-to-word",
        isFirstEncounter: false,
        debugStats: { source: "fallback", mode: "definition-to-word" },
      }),
    );
  });

  test("scenario selection returns null instead of using list fallback when RPC returns no data", async () => {
    const { fetchNextTrainingWordByScenario } = await importService();

    rpc.mockResolvedValueOnce({ data: [], error: null });

    const word = await fetchNextTrainingWordByScenario(
      "user-1",
      "understanding",
      [],
      { listId: "list-1", listType: "curated" },
    );

    expect(word).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "get_next_word",
      expect.objectContaining({
        p_scenario_id: "understanding",
        p_list_id: "list-1",
      }),
    );
  });
});
