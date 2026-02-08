import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createTranslator } from "@/lib/translation/translationProvider";
import { DeepLTranslator } from "@/lib/translation/deeplTranslator";
import { GeminiTranslator } from "@/lib/translation/geminiTranslator";
import { OpenAITranslator } from "@/lib/translation/openaiTranslator";

const makeConfig = () => ({
  provider: "deepl" as const,
  fallback: undefined,
  apiKeys: {
    deepl: "test-key",
  },
  apiUrls: {
    deepl: "https://example.com/deepl",
  },
});

describe("translationProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates DeepL translator when configured", () => {
    const { provider, translator } = createTranslator(makeConfig());
    expect(provider).toBe("deepl");
    expect(translator).toBeInstanceOf(DeepLTranslator);
  });

  it("creates OpenAI translator when configured", () => {
    const { provider, translator } = createTranslator({
      provider: "openai",
      apiKeys: {
        openai: "openai-key",
      },
    });

    expect(provider).toBe("openai");
    expect(translator).toBeInstanceOf(OpenAITranslator);
  });

  it("creates Gemini translator when configured", () => {
    const { provider, translator } = createTranslator({
      provider: "gemini",
      apiKeys: {
        gemini: "gemini-key",
      },
    });

    expect(provider).toBe("gemini");
    expect(translator).toBeInstanceOf(GeminiTranslator);
  });

  it("falls back when primary provider is unavailable", () => {
    const { provider, translator } = createTranslator({
      provider: "openai",
      fallback: "deepl",
      apiKeys: {
        deepl: "fallback-key",
      },
    });

    expect(provider).toBe("deepl");
    expect(translator).toBeInstanceOf(DeepLTranslator);
  });
});

describe("DeepLTranslator", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("translates a single string", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        translations: [
          {
            text: "<translations><t id=\"0\">Hallo</t></translations>",
          },
        ],
      }),
      text: async () => "",
    });

    const translator = new DeepLTranslator({ apiKey: "key", apiUrl: "https://example.com" });
    const translated = await translator.translate("hello", "en");
    expect(translated).toBe("Hallo");

    const [, init] = fetchMock.mock.calls[0] as [string, any];
    const params = new URLSearchParams(init.body);
    expect(params.get("target_lang")).toBe("EN");
    expect(init.headers.Authorization).toBe("DeepL-Auth-Key key");
  });

  it("translates multiple strings", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        translations: [
          {
            text:
              "<translations><t id=\"0\">Hallo</t><t id=\"1\">Wereld</t></translations>",
          },
        ],
      }),
      text: async () => "",
    });

    const translator = new DeepLTranslator({ apiKey: "key", apiUrl: "https://example.com" });
    const translated = await translator.translate(["hello", "world"], "en");
    expect(translated).toEqual(["Hallo", "Wereld"]);
  });
});

describe("OpenAITranslator", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("translates a single string", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ translations: ["Hallo"], note: null }),
            },
          },
        ],
      }),
      text: async () => "",
    });

    const translator = new OpenAITranslator({ apiKey: "key" });
    const translated = await translator.translate("hello", "en");
    expect(translated).toBe("Hallo");

    const [, init] = fetchMock.mock.calls[0] as [string, any];
    expect(init.headers.Authorization).toBe("Bearer key");
  });

  it("extracts a contextual note when provided", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                translations: ["Hallo"],
                note: "Usually means X, but here it means Y.",
              }),
            },
          },
        ],
      }),
      text: async () => "",
    });

    const translator = new OpenAITranslator({ apiKey: "key" });
    const result = await translator.translateWithContextAndNote(["hello"], "en", {
      partOfSpeech: null,
      partOfSpeechCode: null,
    });
    expect(result).toEqual({
      translations: ["Hallo"],
      note: "Usually means X, but here it means Y.",
    });
  });

  it("falls back when OpenAI fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "boom",
    });

    const fallback = {
      translate: vi.fn(async (texts: string[] | string) =>
        Array.isArray(texts) ? ["Fallback"] : "Fallback"
      ),
    } as any;

    const translator = new OpenAITranslator({ apiKey: "key", fallback });
    const translated = await translator.translate("hello", "en");
    expect(translated).toBe("Fallback");
    expect(fallback.translate).toHaveBeenCalled();
  });
});

describe("GeminiTranslator", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("translates a single string", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({ translations: ["Hallo"] }),
                },
              ],
            },
          },
        ],
      }),
      text: async () => "",
    });

    const translator = new GeminiTranslator({ apiKey: "key" });
    const translated = await translator.translate("hello", "en");
    expect(translated).toBe("Hallo");

    const [url, init] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toContain("key=key");
    expect(init.method).toBe("POST");
  });

  it("falls back when Gemini fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "boom",
    });

    const fallback = {
      translate: vi.fn(async (texts: string[] | string) =>
        Array.isArray(texts) ? ["Fallback"] : "Fallback"
      ),
    } as any;

    const translator = new GeminiTranslator({ apiKey: "key", fallback });
    const translated = await translator.translate("hello", "en");
    expect(translated).toBe("Fallback");
    expect(fallback.translate).toHaveBeenCalled();
  });
});
