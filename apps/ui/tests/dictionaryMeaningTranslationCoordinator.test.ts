import { beforeEach, describe, expect, test, vi } from "vitest";

const createTranslator = vi.hoisted(() => vi.fn());

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
    expect(result.payload.error).toMatch(/^provider_unknown_error:[a-f0-9]{24}$/);
    expect(JSON.stringify(result)).not.toContain("provider secret");
  });
});
