import { beforeEach, describe, expect, test, vi } from "vitest";

const createTranslator = vi.hoisted(() => vi.fn());
const getService = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platform/serverSupabase", () => ({
  getTranslationServiceSupabase: getService,
}));

vi.mock("@/lib/translation/translationProvider", () => ({
  createTranslator,
  loadTranslationConfigFromEnv: vi.fn(() => ({
    provider: "openai",
    fallback: null,
    apiKeys: { openai: "test", deepl: null, gemini: null },
  })),
}));

describe("dictionary meaning translation coordinator", () => {
  beforeEach(() => {
    createTranslator.mockReset();
  });

  test("returns a closed error variant when provider configuration fails", async () => {
    createTranslator.mockImplementationOnce(() => {
      throw new Error("provider secret");
    });
    const { coordinateDictionaryMeaningTranslation } = await import(
      "@/lib/translation/dictionaryMeaningTranslationCoordinator"
    );

    const result = await coordinateDictionaryMeaningTranslation({
      wordEntryId: "00000000-0000-4000-8000-000000000001",
      word: {
        id: "00000000-0000-4000-8000-000000000001",
        headword: "huis",
        raw: { meanings: [{ definition: "woning" }] },
      } as any,
      targetLang: "ru",
      dbLang: "ru",
    });

    expect(result).toMatchObject({
      outcome: "error",
      httpStatus: 500,
      cacheStatus: "unknown",
    });
    expect(result.payload.error).toMatch(
      /^provider_unknown_error:[a-f0-9]{24}$/,
    );
    expect(JSON.stringify(result)).not.toContain("provider secret");
  });
});

describe("coordinator artifact readiness contract", () => {
  const word = {
    id: "00000000-0000-4000-8000-000000000001",
    headword: "oog",
    raw: {
      meanings: [{ definition: "een zintuig", examples: ["blauwe ogen"] }],
    },
  };
  const input = {
    wordEntryId: word.id,
    word: word as any,
    targetLang: "ru",
    dbLang: "ru",
  };
  let row: Record<string, any> | null;
  const translate = vi.fn();
  beforeEach(() => {
    row = null;
    translate.mockReset();
    translate.mockResolvedValue({
      entryTranslation: {
        primaryText: "глаз",
        alternativeTexts: [],
        baseText: "глаз",
        note: null,
      },
      contentTranslations: [
        { fieldId: "definition", text: "орган чувств" },
        { fieldId: "example:0", text: "голубые глаза" },
      ],
      meta: { providerUsed: "openai" },
    });
    createTranslator.mockReturnValue({
      provider: "openai",
      translator: { translateDictionaryMeaning: translate },
    });
    getService.mockReturnValue({
      supabase: {
        from: () => {
          let values: Record<string, any> | null = null;
          let insert = false;
          const filters: Array<[string, unknown]> = [];
          const execute = () => {
            const matches =
              Boolean(row) &&
              filters.every(([key, value]) => row![key] === value);
            if (insert && !row) row = { ...values };
            else if (values && matches) row = { ...row, ...values };
            return { data: row, error: null };
          };
          const query: any = {
            select: () => query,
            eq: (key: string, value: unknown) => {
              filters.push([key, value]);
              return query;
            },
            update: (next: Record<string, any>) => {
              values = next;
              return query;
            },
            upsert: (next: Record<string, any>) => {
              values = next;
              insert = true;
              return query;
            },
            maybeSingle: async () => execute(),
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve(execute()).then(resolve),
          };
          return query;
        },
      },
    });
  });
  test("valid cache reads remain free of provider execution; a missing example is repaired", async () => {
    const { coordinateDictionaryMeaningTranslation: coordinate } = await import(
      "@/lib/translation/dictionaryMeaningTranslationCoordinator"
    );
    expect((await coordinate(input)).outcome).toBe("ready");
    expect((await coordinate(input)).cacheStatus).toBe("hit");
    expect(translate).toHaveBeenCalledTimes(1);
    row!.overlay.meanings[0].examples = [];
    expect((await coordinate(input)).cacheStatus).toBe("provider");
    expect(translate).toHaveBeenCalledTimes(2);
    expect(row!.overlay.meanings[0].examples[0]).toBe("голубые глаза");
  });
  test("complete idiom-only cache reads do not require a fabricated headword", async () => {
    const idiomWord = {
      ...word,
      raw: {
        meanings: [
          { idioms: [{ expression: "in het oog", explanation: "zichtbaar" }] },
        ],
      },
    };
    translate.mockResolvedValue({
      entryTranslation: null,
      contentTranslations: [
        { fieldId: "idiom:0", text: "на виду" },
        { fieldId: "idiom:0:explanation", text: "видно" },
      ],
      meta: { providerUsed: "openai" },
    });
    const { coordinateDictionaryMeaningTranslation: coordinate } = await import(
      "@/lib/translation/dictionaryMeaningTranslationCoordinator"
    );
    expect(
      (await coordinate({ ...input, word: idiomWord as any })).outcome,
    ).toBe("ready");
    expect(
      (await coordinate({ ...input, word: idiomWord as any })).cacheStatus,
    ).toBe("hit");
    expect(translate).toHaveBeenCalledTimes(1);
    expect(row!.overlay.headword).toBeUndefined();
  });
  test("a provider returning only a headword cannot publish ready", async () => {
    translate.mockResolvedValueOnce({
      entryTranslation: {
        primaryText: "глаз",
        alternativeTexts: [],
        baseText: "глаз",
        note: null,
      },
      contentTranslations: [],
      meta: {},
    });
    const { coordinateDictionaryMeaningTranslation: coordinate } = await import(
      "@/lib/translation/dictionaryMeaningTranslationCoordinator"
    );
    const result = await coordinate(input);
    expect(result.outcome).toBe("failed");
    expect(row!.status).toBe("failed");
    expect(row!.overlay).toBeNull();
    expect(JSON.stringify(result)).not.toContain("Incomplete dictionary");
  });
});
