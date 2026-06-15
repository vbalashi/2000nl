import { beforeEach, describe, expect, test, vi } from "vitest";

type QueryResponse = { data?: any; error?: any; count?: number };

type QueryRecord = {
  table: string;
  response: QueryResponse;
  select: any;
  eq: any;
  ilike: any;
  order: any;
  limit: any;
  maybeSingle: any;
};

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
  query.ilike = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => response);
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
const rpc = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from,
    rpc,
  },
}));

const importService = async () => {
  const service = await import("@/lib/trainingService");
  return {
    copyEntryToUserDictionary: service.copyEntryToUserDictionary,
    createUserDictionaryEntry: service.createUserDictionaryEntry,
    fetchDictionaryEntry: service.fetchDictionaryEntry,
    fetchDictionaryEntryById: service.fetchDictionaryEntryById,
    fetchTrainingWordById: service.fetchTrainingWordById,
    fetchTrainingWordByLookup: service.fetchTrainingWordByLookup,
  };
};

const row = {
  id: "word-1",
  headword: "huis",
  part_of_speech: "zn",
  gender: "het",
  raw: JSON.stringify({ meanings: [{ definition: "Een gebouw" }] }),
  is_nt2_2000: true,
};
const uuid = "8b9df84e-7956-4712-a39a-3ea8363be1cf";

describe("trainingService dictionary lookup", () => {
  beforeEach(() => {
    from.mockClear();
    rpc.mockClear();
    fromResponses.clear();
    queries.length = 0;
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  test("fetchTrainingWordById returns null without an authenticated user", async () => {
    const { fetchTrainingWordById } = await importService();

    await expect(fetchTrainingWordById("word-1")).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("fetchTrainingWordById uses gated RPC when a user id is provided", async () => {
    const { fetchTrainingWordById } = await importService();
    rpc.mockResolvedValueOnce({
      data: {
        ...row,
        dictionary_id: "dict-1",
        language_code: "nl",
        raw: { meanings: [{ definition: "Een gebouw" }] },
        meanings_count: 2,
      },
      error: null,
    });

    await expect(fetchTrainingWordById("word-1", "user-1")).resolves.toEqual(
      expect.objectContaining({
        id: "word-1",
        dictionary_id: "dict-1",
        language_code: "nl",
        meanings_count: 2,
      }),
    );
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_by_id_gated", {
      p_entry_id: "word-1",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("fetchDictionaryEntryById preserves dictionary source metadata", async () => {
    const { fetchDictionaryEntryById } = await importService();
    rpc.mockResolvedValueOnce({
      data: {
        ...row,
        dictionary_id: "dict-user",
        dictionary_name: "My dictionary",
        dictionary_slug: "user-user-1-nl",
        dictionary_kind: "user",
        language_code: "nl",
        raw: { definition: "private definition" },
      },
      error: null,
    });

    await expect(fetchDictionaryEntryById("word-1", "user-1")).resolves.toEqual(
      expect.objectContaining({
        id: "word-1",
        dictionary_id: "dict-user",
        dictionary_name: "My dictionary",
        dictionary_slug: "user-user-1-nl",
        dictionary_kind: "user",
        raw: { definition: "private definition" },
      }),
    );
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_by_id_gated", {
      p_entry_id: "word-1",
    });
  });

  test("fetchTrainingWordByLookup returns null for blank lookup without querying", async () => {
    const { fetchTrainingWordByLookup } = await importService();

    await expect(fetchTrainingWordByLookup("   ")).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  test("fetchTrainingWordByLookup returns null for unauthenticated ids", async () => {
    const { fetchTrainingWordByLookup } = await importService();

    const word = await fetchTrainingWordByLookup(` ${uuid} `);

    expect(word).toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("fetchTrainingWordByLookup returns null for unauthenticated headwords", async () => {
    const { fetchTrainingWordByLookup } = await importService();

    const word = await fetchTrainingWordByLookup("huis");

    expect(word).toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("fetchTrainingWordByLookup uses gated lookup for authenticated headwords", async () => {
    const { fetchTrainingWordByLookup } = await importService();
    rpc.mockResolvedValueOnce({
      data: [
        {
          ...row,
          dictionary_id: "dict-1",
          language_code: "nl",
          raw: { meanings: [{ definition: "Een gebouw" }] },
          meanings_count: 1,
        },
      ],
      error: null,
    });

    const word = await fetchTrainingWordByLookup("huis", "user-1");

    expect(word).toEqual(
      expect.objectContaining({
        id: "word-1",
        dictionary_id: "dict-1",
        language_code: "nl",
        headword: "huis",
      }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_gated", {
      p_headword: "huis",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("fetchDictionaryEntry returns null without an authenticated user", async () => {
    const { fetchDictionaryEntry } = await importService();

    await expect(fetchDictionaryEntry("huis")).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  test("fetchDictionaryEntry prefers gated lookup RPC for authenticated users", async () => {
    const { fetchDictionaryEntry } = await importService();
    rpc.mockResolvedValueOnce({
      data: [
        {
          ...row,
          raw: { meanings: [{ definition: "Een gebouw" }] },
          dictionary_id: "dict-1",
          language_code: "nl",
          meanings_count: 2,
          stats: {
            click_count: 3,
            last_seen_at: "2026-05-17T10:00:00.000Z",
          },
        },
        {
          ...row,
          id: "word-2",
          headword: "huis",
          dictionary_id: "dict-2",
          raw: { translation: { languageCode: "en", text: "house" } },
        },
      ],
      error: null,
    });

    await expect(fetchDictionaryEntry("huis", "user-1")).resolves.toEqual({
      id: "word-1",
      dictionary_id: "dict-1",
      language_code: "nl",
      headword: "huis",
      part_of_speech: "zn",
      gender: "het",
      raw: { meanings: [{ definition: "Een gebouw" }] },
      is_nt2_2000: true,
      meanings_count: 2,
      stats: {
        click_count: 3,
        last_seen_at: "2026-05-17T10:00:00.000Z",
      },
    });
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_gated", {
      p_headword: "huis",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("fetchDictionaryEntry does not fall back to direct tables for authenticated gated lookup failures", async () => {
    const { fetchDictionaryEntry } = await importService();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });

    await expect(fetchDictionaryEntry("huis", "user-1")).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_gated", {
      p_headword: "huis",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("createUserDictionaryEntry calls the platform action endpoint", async () => {
    const { createUserDictionaryEntry } = await importService();
    window.localStorage.setItem(
      "sb-test-auth-token",
      JSON.stringify({ access_token: "token-1" }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        action: "create-user-entry",
        entryId: "entry-created",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createUserDictionaryEntry({
        entry: {
          headword: "gedoe",
          languageCode: "nl",
          definition: "hassle",
        },
      }),
    ).resolves.toBe("entry-created");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/platform/v1/actions",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          action: "create-user-entry",
          dictionaryId: null,
          entry: {
            headword: "gedoe",
            languageCode: "nl",
            definition: "hassle",
          },
        }),
      }),
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer token-1");
  });

  test("copyEntryToUserDictionary calls the platform copy action", async () => {
    const { copyEntryToUserDictionary } = await importService();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        action: "copy-to-user-dictionary",
        copiedEntryId: "entry-copy",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      copyEntryToUserDictionary({
        entryId: "entry-source",
        overrides: { definition: "my wording" },
      }),
    ).resolves.toBe("entry-copy");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/platform/v1/actions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "copy-to-user-dictionary",
          entryId: "entry-source",
          targetDictionaryId: null,
          overrides: { definition: "my wording" },
        }),
      }),
    );
  });

});
