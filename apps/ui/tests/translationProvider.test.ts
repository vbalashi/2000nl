import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createTranslator } from "@/lib/translation/translationProvider";
import { DeepLTranslator } from "@/lib/translation/deeplTranslator";

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
