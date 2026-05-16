import { beforeEach, describe, expect, test, vi } from "vitest";

type QueryResponse = { data?: any; error?: any; count?: number };

type QueryRecord = {
  table: string;
  response: QueryResponse;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
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

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from,
  },
}));

const importService = async () => {
  const service = await import("@/lib/trainingService");
  return {
    fetchDictionaryEntry: service.fetchDictionaryEntry,
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

describe("trainingService dictionary lookup", () => {
  beforeEach(() => {
    from.mockClear();
    fromResponses.clear();
    queries.length = 0;
  });

  test("fetchTrainingWordById maps a word entry by id", async () => {
    const { fetchTrainingWordById } = await importService();
    queueFrom("word_entries", { data: row, error: null });

    await expect(fetchTrainingWordById("word-1")).resolves.toEqual({
      id: "word-1",
      headword: "huis",
      part_of_speech: "zn",
      gender: "het",
      raw: { meanings: [{ definition: "Een gebouw" }] },
      is_nt2_2000: true,
      isFirstEncounter: false,
    });
    expect(queries[0].eq).toHaveBeenCalledWith("id", "word-1");
    expect(queries[0].limit).toHaveBeenCalledWith(1);
  });

  test("fetchTrainingWordByLookup returns null for blank lookup without querying", async () => {
    const { fetchTrainingWordByLookup } = await importService();

    await expect(fetchTrainingWordByLookup("   ")).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  test("fetchTrainingWordByLookup tries id first and returns it when found", async () => {
    const { fetchTrainingWordByLookup } = await importService();
    queueFrom("word_entries", { data: row, error: null });

    const word = await fetchTrainingWordByLookup(" word-1 ");

    expect(word?.id).toBe("word-1");
    expect(queries).toHaveLength(1);
    expect(queries[0].eq).toHaveBeenCalledWith("id", "word-1");
  });

  test("fetchTrainingWordByLookup falls back to headword ilike when id is not found", async () => {
    const { fetchTrainingWordByLookup } = await importService();
    queueFrom("word_entries", { data: null, error: null });
    queueFrom("word_entries", {
      data: { ...row, id: "word-headword" },
      error: null,
    });

    const word = await fetchTrainingWordByLookup("huis");

    expect(word?.id).toBe("word-headword");
    expect(queries[0].eq).toHaveBeenCalledWith("id", "huis");
    expect(queries[1].ilike).toHaveBeenCalledWith("headword", "huis");
  });

  test("fetchDictionaryEntry returns direct headword match with meanings count and user stats", async () => {
    const { fetchDictionaryEntry } = await importService();
    queueFrom("word_entries", { data: row, error: null });
    queueFrom("word_entries", { count: 3, error: null });
    queueFrom("user_word_status", {
      data: {
        click_count: 7,
        last_seen_at: "2026-05-16T10:00:00.000Z",
      },
      error: null,
    });

    await expect(fetchDictionaryEntry("huis", "user-1")).resolves.toEqual({
      id: "word-1",
      headword: "huis",
      part_of_speech: "zn",
      gender: "het",
      raw: { meanings: [{ definition: "Een gebouw" }] },
      is_nt2_2000: true,
      meanings_count: 3,
      stats: {
        click_count: 7,
        last_seen_at: "2026-05-16T10:00:00.000Z",
      },
    });
    expect(queries[0].eq).toHaveBeenCalledWith("headword", "huis");
    expect(queries[1].select).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(queries[2].eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(queries[2].eq).toHaveBeenCalledWith("word_id", "word-1");
  });

  test("fetchDictionaryEntry retries lowercase direct match before word_forms", async () => {
    const { fetchDictionaryEntry } = await importService();
    queueFrom("word_entries", { data: null, error: null });
    queueFrom("word_entries", { data: { ...row, headword: "huis" }, error: null });
    queueFrom("word_entries", { count: 1, error: null });

    const entry = await fetchDictionaryEntry("Huis");

    expect(entry?.headword).toBe("huis");
    expect(queries[0].eq).toHaveBeenCalledWith("headword", "Huis");
    expect(queries[1].eq).toHaveBeenCalledWith("headword", "huis");
    expect(from).not.toHaveBeenCalledWith("word_forms");
  });

  test("fetchDictionaryEntry falls back through word_forms and fetches by mapped id", async () => {
    const { fetchDictionaryEntry } = await importService();
    queueFrom("word_entries", { data: null, error: null });
    queueFrom("word_forms", {
      data: { word_id: "word-from-form", headword: "lopen" },
      error: null,
    });
    queueFrom("word_entries", {
      data: { ...row, id: "word-from-form", headword: "lopen" },
      error: null,
    });

    const entry = await fetchDictionaryEntry("liep");

    expect(entry?.id).toBe("word-from-form");
    expect(queries[1].table).toBe("word_forms");
    expect(queries[1].eq).toHaveBeenCalledWith("form", "liep");
    expect(queries[1].order).toHaveBeenCalledWith("headword", {
      ascending: true,
    });
    expect(queries[2].eq).toHaveBeenCalledWith("id", "word-from-form");
  });
});
