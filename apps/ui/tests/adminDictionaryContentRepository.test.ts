import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { listAdminDictionaryContent } from "@/lib/admin/dictionaryRepository";

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe("admin dictionary content repository", () => {
  it("reads only the requested dictionary page and projects personal entry content", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-secret");
    const builder = {
      select: mocks.select,
      eq: mocks.eq,
      order: mocks.order,
      range: mocks.range,
    };
    mocks.createClient.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue(builder);
    mocks.select.mockReturnValue(builder);
    mocks.eq.mockReturnValue(builder);
    mocks.order.mockReturnValue(builder);
    mocks.range.mockResolvedValue({
      data: [{
        id: "entry-1",
        headword: "eigen woord",
        language_code: "nl",
        part_of_speech: "noun",
        meaning_id: 2,
        raw: { meanings: [{ meaningId: 2, definition: "persoonlijke definitie" }] },
      }],
      error: null,
      count: 26,
    });

    const result = await listAdminDictionaryContent({ dictionaryId: "personal-dictionary", page: 2, pageSize: 25 });

    expect(mocks.from).toHaveBeenCalledWith("word_entries");
    expect(mocks.select).toHaveBeenCalledWith("id,headword,language_code,part_of_speech,meaning_id,raw", { count: "exact" });
    expect(mocks.eq).toHaveBeenCalledWith("dictionary_id", "personal-dictionary");
    expect(mocks.range).toHaveBeenCalledWith(25, 49);
    expect(result).toEqual({
      items: [{ id: "entry-1", headword: "eigen woord", languageCode: "nl", partOfSpeech: "noun", meaningId: 2, definition: "persoonlijke definitie" }],
      page: 2,
      pageSize: 25,
      total: 26,
      hasNext: false,
    });
  });
});
