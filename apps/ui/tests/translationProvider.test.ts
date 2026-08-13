import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createTranslator, loadTranslationConfigFromEnv } from "@/lib/translation/translationProvider";
import { DeepLTranslator } from "@/lib/translation/deeplTranslator";
import { GeminiTranslator } from "@/lib/translation/geminiTranslator";
import { OpenAITranslator } from "@/lib/translation/openaiTranslator";
import { DICTIONARY_MEANING_TRANSLATION_CONTRACT_VERSION } from "@/lib/translation/dictionaryMeaningTranslationContract";
import { translationProviderFailure } from "@/lib/translation/translationProviderFailure";

describe("translation provider failure metadata", () => {
  it("does not derive the public fingerprint from provider-controlled text", () => {
    const first = translationProviderFailure(
      "provider_http_error",
      "guessable-secret-one",
    );
    const second = translationProviderFailure(
      "provider_http_error",
      "different-secret-two",
    );

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain("secret");
  });
});

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

describe("loadTranslationConfigFromEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_URL;
    delete process.env.AZURE_OPENAI_API_VERSION;
    delete process.env.AZURE_OPENAI_DEPLOYMENT;
    delete process.env.AZURE_OPENAI_MODEL;
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.OPENAI_MODEL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("does not duplicate /openai/v1 when AZURE_OPENAI_ENDPOINT already includes it", () => {
    process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com/openai/v1/";
    process.env.AZURE_OPENAI_API_KEY = "azure-key";
    process.env.OPENAI_MODEL = "deployment-name";

    const config = loadTranslationConfigFromEnv();
    expect(config.apiUrls?.openai).toBe(
      "https://example.openai.azure.com/openai/v1/chat/completions"
    );
  });

  it("builds Azure deployments endpoint when api-version and deployment are provided", () => {
    process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com/openai/v1/";
    process.env.AZURE_OPENAI_API_VERSION = "2024-02-15-preview";
    process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4.1";
    process.env.AZURE_OPENAI_API_KEY = "azure-key";

    const config = loadTranslationConfigFromEnv();
    expect(config.apiUrls?.openai).toBe(
      "https://example.openai.azure.com/openai/deployments/gpt-4.1/chat/completions?api-version=2024-02-15-preview"
    );
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

  it("does not expose a DeepL response body in its error", async () => {
    const providerSecret = "deepl-provider-body-with-token";
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: async () => providerSecret,
    });

    const translator = new DeepLTranslator({
      apiKey: "key",
      apiUrl: "https://example.com",
    });
    const error = await translator.translate("hello", "en").catch((value) => value);

    expect(String(error)).not.toContain(providerSecret);
    expect(error).toMatchObject({
      failure: {
        code: "provider_http_error",
        fingerprint: expect.stringMatching(/^[a-f0-9]{24}$/),
      },
    });
  });
});

describe("OpenAITranslator", () => {
  const fetchMock = vi.fn();
  let warnSpy: any;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy?.mockRestore?.();
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

  it("uses Azure api-key header when calling an Azure OpenAI endpoint", async () => {
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

    const translator = new OpenAITranslator({
      apiKey: "azure-key",
      apiUrl: "https://example.openai.azure.com/openai/v1/chat/completions",
      model: "deployment-name",
    });
    const translated = await translator.translate("hello", "en");
    expect(translated).toBe("Hallo");

    const [, init] = fetchMock.mock.calls[0] as [string, any];
    expect(init.headers["api-key"]).toBe("azure-key");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("omits model in request body for Azure deployments endpoint URLs", async () => {
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

    const translator = new OpenAITranslator({
      apiKey: "azure-key",
      apiUrl:
        "https://example.openai.azure.com/openai/deployments/my-deployment/chat/completions?api-version=2024-02-15-preview",
      model: "ignored",
    });
    await translator.translate("hello", "en");

    const [, init] = fetchMock.mock.calls[0] as [string, any];
    const body = JSON.parse(init.body);
    expect(body.model).toBeUndefined();
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
    expect(result).toMatchObject({
      translations: ["Hallo"],
      note: "Usually means X, but here it means Y.",
    });
    expect(result.meta?.providerUsed).toBe("openai");
  });

  it("sends source context and parses literal translations", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                translations: ["резко возрастают."],
                literalTranslations: ["огромный палец ноги."],
                note: "Здесь это часть разделяемого глагола nemen ... toe.",
              }),
            },
          },
        ],
      }),
      text: async () => "",
    });

    const translator = new OpenAITranslator({ apiKey: "key" });
    const result = await translator.translateWithContextAndNote(["enorm toe."], "ru", {
      sourceLanguageCode: "nl",
      purpose: "youtube-span-translation",
      contextText: "Plotseling nemen de kansen om leven in het universum te vinden enorm toe.",
    });

    expect(result).toMatchObject({
      translations: ["резко возрастают."],
      literalTranslations: ["огромный палец ноги."],
      note: "Здесь это часть разделяемого глагола nemen ... toe.",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, any];
    const body = JSON.parse(init.body);
    const userMessage = JSON.parse(body.messages[1].content);
    expect(userMessage).toMatchObject({
      sourceLanguageCode: "nl",
      purpose: "youtube-span-translation",
      targetLanguage: "Russian",
      targetLanguageCode: "ru",
      commentLanguage: "Russian",
      texts: ["enorm toe."],
      contextText: "Plotseling nemen de kansen om leven in het universum te vinden enorm toe.",
    });
    expect(userMessage.instructions).toContain("Write 'note' in commentLanguage");
    expect(userMessage.instructions).toContain("For targetLanguageCode 'ru'");
  });

  it("translates an exact dictionary meaning with structured alternatives", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entryTranslation: {
                  primaryText: "бельё",
                  alternativeTexts: ["одежда", "текстиль"],
                  baseText: "добро",
                  note: "Здесь имеется в виду одежда для стирки.",
                },
                contentTranslations: [
                  { fieldId: "definition", text: "ткань; одежда" },
                ],
              }),
            },
          },
        ],
      }),
      text: async () => "",
    });

    const translator = new OpenAITranslator({ apiKey: "key" });
    const result = await translator.translateDictionaryMeaning({
      contractVersion: DICTIONARY_MEANING_TRANSLATION_CONTRACT_VERSION,
      entryId: "entry-goed-cloth",
      sourceContentFingerprint: "source-revision-1",
      sourceLanguageCode: "nl",
      targetLanguageCode: "ru",
      headword: {
        text: "goed",
        article: "het",
        partOfSpeech: "zelfstandig naamwoord",
        partOfSpeechCode: "zn",
      },
      content: [
        {
          fieldId: "definition",
          role: "definition",
          text: "de stof; de kleren",
        },
      ],
    });

    expect(result.entryTranslation).toEqual({
      primaryText: "бельё",
      alternativeTexts: ["одежда", "текстиль"],
      baseText: "добро",
      note: "Здесь имеется в виду одежда для стирки.",
    });
    expect(result.meta).toMatchObject({
      providerUsed: "openai",
      usedFallback: false,
    });
  });

  it("falls back when OpenAI fails", async () => {
    const providerSecret = "sk-provider-secret-from-response";
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => providerSecret,
    });

    const fallback = {
      translate: vi.fn(async (texts: string[] | string) =>
        Array.isArray(texts) ? ["Fallback"] : "Fallback"
      ),
    } as any;

    const translator = new OpenAITranslator({ apiKey: "key", fallback, maxRetries: 0 });
    const translated = await translator.translate("hello", "en");
    expect(translated).toBe("Fallback");
    expect(fallback.translate).toHaveBeenCalled();
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(providerSecret);
    expect(warnSpy).toHaveBeenCalledWith(
      "[translation] OpenAI failed; using DeepL fallback",
      expect.objectContaining({
        failure: expect.objectContaining({
          code: "provider_http_error",
          fingerprint: expect.stringMatching(/^[a-f0-9]{24}$/),
        }),
      }),
    );
  });

  it("preserves structured dictionary artifacts when OpenAI falls back", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "boom",
    });
    const fallback = {
      translate: vi.fn(async () => ["бельё", "ткань; одежда"]),
    } as any;
    const translator = new OpenAITranslator({
      apiKey: "key",
      fallback,
      maxRetries: 0,
    });

    const result = await translator.translateDictionaryMeaning({
      contractVersion: DICTIONARY_MEANING_TRANSLATION_CONTRACT_VERSION,
      entryId: "entry-goed-cloth",
      sourceContentFingerprint: "source-revision-1",
      sourceLanguageCode: "nl",
      targetLanguageCode: "ru",
      headword: {
        text: "goed",
        article: "het",
        partOfSpeech: "zelfstandig naamwoord",
        partOfSpeechCode: "zn",
      },
      content: [
        {
          fieldId: "definition",
          role: "definition",
          text: "de stof; de kleren",
        },
      ],
    });

    expect(result).toMatchObject({
      entryTranslation: {
        primaryText: "бельё",
        alternativeTexts: [],
        baseText: "бельё",
        note: null,
      },
      contentTranslations: [
        { fieldId: "definition", text: "ткань; одежда" },
      ],
      meta: {
        providerSelected: "openai",
        providerUsed: "deepl",
        usedFallback: true,
        primaryFailure: {
          code: "provider_http_error",
          fingerprint: expect.stringMatching(/^[a-f0-9]{24}$/),
        },
      },
    });
  });
});

describe("GeminiTranslator", () => {
  const fetchMock = vi.fn();
  let warnSpy: any;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy?.mockRestore?.();
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
    const providerSecret = "gemini-provider-secret-from-response";
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => providerSecret,
    });

    const fallback = {
      translate: vi.fn(async (texts: string[] | string) =>
        Array.isArray(texts) ? ["Fallback"] : "Fallback"
      ),
    } as any;

    const translator = new GeminiTranslator({ apiKey: "key", fallback, maxRetries: 0 });
    const translated = await translator.translateWithMetadata(["hello"], "en");
    expect(translated).toMatchObject({
      translations: ["Fallback"],
      meta: {
        providerSelected: "gemini",
        providerUsed: "deepl",
        usedFallback: true,
        primaryFailure: {
          code: "provider_http_error",
          fingerprint: expect.stringMatching(/^[a-f0-9]{24}$/),
        },
      },
    });
    expect(fallback.translate).toHaveBeenCalled();
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(providerSecret);
    expect(warnSpy).toHaveBeenCalledWith(
      "[translation] Gemini failed; using DeepL fallback",
      expect.objectContaining({
        failure: expect.objectContaining({
          code: "provider_http_error",
          fingerprint: expect.stringMatching(/^[a-f0-9]{24}$/),
        }),
      }),
    );
  });
});
