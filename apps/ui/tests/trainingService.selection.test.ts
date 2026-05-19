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
    fetchScenarioStats: service.fetchScenarioStats,
    fetchTrainingScenarios: service.fetchTrainingScenarios,
  };
};

describe("trainingService next-word selection", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  const mockScenarioModes = (
    cardModes: string[] = ["word-to-definition", "definition-to-word"],
  ) => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "understanding",
          name_en: "Understanding",
          card_modes: cardModes,
        },
      ],
      error: null,
    });
  };

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
      ["word-2:definition-to-word"],
    );

    expect(rpc).toHaveBeenCalledWith("get_next_card", {
      p_user_id: "user-1",
      p_card_type_ids: ["word-to-definition", "definition-to-word"],
      p_exclude_entry_ids: ["skip-1"],
      p_exclude_card_keys: ["word-2:definition-to-word"],
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

  test("fetchNextTrainingWordByScenario resolves scenario modes and preserves RPC mode for first encounters", async () => {
    const { fetchNextTrainingWordByScenario } = await importService();

    mockScenarioModes();
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
      ["already-seen:word-to-definition"],
    );

    expect(rpc).toHaveBeenNthCalledWith(1, "get_training_scenarios");
    expect(rpc).toHaveBeenNthCalledWith(2, "get_next_card", {
      p_user_id: "user-1",
      p_card_type_ids: ["word-to-definition", "definition-to-word"],
      p_exclude_entry_ids: ["already-seen"],
      p_exclude_card_keys: ["already-seen:word-to-definition"],
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
        mode: "definition-to-word",
        debugStats: expect.objectContaining({
          source: "new",
          stability: 0.1,
          ef: 0.1,
        }),
      }),
    );
  });

  test("scenario selection filters to supported audio card modes", async () => {
    const { fetchNextTrainingWordByScenario } = await importService();

    mockScenarioModes(["listen-recognize", "listen-type"]);
    rpc.mockResolvedValueOnce({
      data: {
        id: "word-audio",
        headword: "huis",
        raw: JSON.stringify({
          audio_links: { nl: "/huis.mp3" },
          meanings: [{ definition: "woning" }],
        }),
        mode: "listen-recognize",
        stats: { source: "new", mode: "listen-recognize" },
      },
      error: null,
    });

    const word = await fetchNextTrainingWordByScenario(
      "user-1",
      "understanding",
      [],
      { listId: "audio-list", listType: "user" },
    );

    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "get_next_card",
      expect.objectContaining({
        p_card_type_ids: ["listen-recognize"],
        p_list_id: "audio-list",
        p_list_type: "user",
      }),
    );
    expect(word?.mode).toBe("listen-recognize");
  });

  test("scenario selection returns null when a scenario only has unsupported modes", async () => {
    const { fetchNextTrainingWordByScenario } = await importService();

    mockScenarioModes(["listen-type"]);

    const word = await fetchNextTrainingWordByScenario(
      "user-1",
      "understanding",
      [],
      { listId: "audio-list", listType: "user" },
    );

    expect(word).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_training_scenarios");
  });

  test("selection skips cross-reference-only rows and retries with the skipped id excluded", async () => {
    const { fetchNextTrainingWordByScenario } = await importService();
    const payloads: any[] = [];

    mockScenarioModes();
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
      "get_training_scenarios",
      "get_next_card",
      "get_next_card",
    ]);
    expect(payloads).toEqual([
      expect.objectContaining({
        p_exclude_entry_ids: ["initial-skip"],
        p_exclude_card_keys: [],
      }),
      expect.objectContaining({
        p_exclude_entry_ids: ["initial-skip", "cross-ref"],
        p_exclude_card_keys: [],
      }),
    ]);
    expect(word?.id).toBe("word-2");
  });

  test("selection returns null instead of using frontend list fallback when RPC returns no data", async () => {
    const { fetchNextTrainingWord } = await importService();

    rpc.mockResolvedValueOnce({ data: [], error: null });

    const word = await fetchNextTrainingWord(
      "user-1",
      ["definition-to-word"],
      ["already-used"],
      { listId: "list-1", listType: "curated" },
      "both",
      "auto",
    );

    expect(word).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "get_next_card",
      expect.objectContaining({
        p_list_id: "list-1",
        p_list_type: "curated",
      }),
    );
  });

  test("scenario selection returns null instead of using list fallback when RPC returns no data", async () => {
    const { fetchNextTrainingWordByScenario } = await importService();

    mockScenarioModes(["word-to-definition"]);
    rpc.mockResolvedValueOnce({ data: [], error: null });

    const word = await fetchNextTrainingWordByScenario(
      "user-1",
      "understanding",
      [],
      { listId: "list-1", listType: "curated" },
    );

    expect(word).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(2,
      "get_next_card",
      expect.objectContaining({
        p_card_type_ids: ["word-to-definition"],
        p_list_id: "list-1",
      }),
    );
  });

  test("scenario selection can restrict card modes with an explicit override", async () => {
    const { fetchNextTrainingWordByScenario } = await importService();

    mockScenarioModes(["word-to-definition", "definition-to-word"]);
    rpc.mockResolvedValueOnce({
      data: {
        id: "word-restricted",
        headword: "beperkt",
        raw: JSON.stringify({ meanings: [{ definition: "begrensd" }] }),
        mode: "definition-to-word",
        stats: { source: "review", mode: "definition-to-word" },
      },
      error: null,
    });

    await fetchNextTrainingWordByScenario(
      "user-1",
      "understanding",
      [],
      { listId: "list-1", listType: "user" },
      "both",
      "review",
      [],
      ["definition-to-word"],
    );

    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "get_next_card",
      expect.objectContaining({
        p_card_type_ids: ["definition-to-word"],
        p_list_id: "list-1",
        p_list_type: "user",
      }),
    );
  });

  test("scenario selection returns null when an explicit mode override is empty", async () => {
    const { fetchNextTrainingWordByScenario } = await importService();

    mockScenarioModes(["word-to-definition", "definition-to-word"]);

    const word = await fetchNextTrainingWordByScenario(
      "user-1",
      "understanding",
      [],
      { listId: "list-1", listType: "user" },
      "both",
      "review",
      [],
      [],
    );

    expect(word).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_training_scenarios");
  });

  test("fetchTrainingScenarios maps RPC rows with defaults", async () => {
    const { fetchTrainingScenarios } = await importService();

    rpc.mockResolvedValueOnce({
      data: [
        {
        id: "understanding",
        name_en: "Understanding",
        description: "Read and understand",
        card_modes: ["word-to-definition"],
        graduation_threshold: 7,
      },
      {
        id: "speaking",
        name_en: "Speaking",
      },
      ],
      error: null,
    });

    await expect(fetchTrainingScenarios()).resolves.toEqual([
      {
        id: "understanding",
        nameEn: "Understanding",
        nameNl: undefined,
        description: "Read and understand",
        cardModes: ["word-to-definition"],
        graduationThreshold: 7,
        enabled: true,
        sortOrder: 0,
      },
      {
        id: "speaking",
        nameEn: "Speaking",
        nameNl: undefined,
        description: undefined,
        cardModes: [],
        graduationThreshold: 21,
        enabled: true,
        sortOrder: 0,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_training_scenarios");
  });

  test("fetchScenarioStats forwards list scope and applies conservative defaults", async () => {
    const { fetchScenarioStats } = await importService();

    rpc.mockResolvedValueOnce({
      data: {
        learned: 3,
        total: 10,
        scenario_id: "from-rpc",
        card_modes: ["definition-to-word"],
      },
      error: null,
    });

    await expect(
      fetchScenarioStats("user-1", "understanding", {
        listId: "list-1",
        listType: "user",
      }),
    ).resolves.toEqual({
      learned: 3,
      inProgress: 0,
      new: 0,
      total: 10,
      scenarioId: "from-rpc",
      cardModes: ["definition-to-word"],
      graduationThreshold: 21,
    });
    expect(rpc).toHaveBeenCalledWith("get_scenario_stats", {
      p_user_id: "user-1",
      p_scenario_id: "understanding",
      p_list_id: "list-1",
      p_list_type: "user",
    });
  });
});
