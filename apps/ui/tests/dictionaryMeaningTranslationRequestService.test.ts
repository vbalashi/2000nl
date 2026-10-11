import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  service: vi.fn(),
  create: vi.fn(),
  identity: vi.fn(),
  legacy: vi.fn(),
}));
vi.mock("@/lib/platform/serverSupabase", () => ({
  getTranslationServiceSupabase: mocks.service,
}));
vi.mock("@/lib/translation/translationProvider", () => ({
  createTranslator: mocks.create,
  loadTranslationConfigFromEnv: () => ({}),
}));
vi.mock("@/lib/translation/dictionaryMeaningTranslationIdentity", () => ({
  dictionaryMeaningTranslationIdentity: mocks.identity,
}));
vi.mock("@/lib/translation/dictionaryMeaningTranslationCoordinator", () => ({
  coordinateDictionaryMeaningTranslation: mocks.legacy,
}));
import { requestDictionaryMeaningTranslation as request } from "@/lib/translation/dictionaryMeaningTranslationRequestService";
const input = {
  wordEntryId: "entry",
  word: {
    headword: "secret source text",
    raw: { meanings: [{ definition: "secret source text" }] },
  } as any,
  targetLang: "ru",
  dbLang: "ru",
};
const identity = {
  request: {
    contractVersion: "dictionary-meaning-translation-v1",
    entryId: "entry",
    sourceContentFingerprint: "revision",
    sourceLanguageCode: "nl",
    targetLanguageCode: "ru",
    headword: {
      text: "oog",
      article: null,
      partOfSpeech: null,
      partOfSpeechCode: null,
    },
    content: [
      { fieldId: "definition", role: "definition", text: "een zintuig" },
    ],
  },
  sourceContentRevision: "revision",
  providerRevision: "prompt",
  policyVersion: "policy",
  fingerprint: "fingerprint",
};
let cache: any = null;
let job: any = { id: "job", status: "queued", attempt: 0 };
let rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: job, error: null }));
let translate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("DICTIONARY_TRANSLATION_JOBS_ENABLED", "true");
  cache = null;
  job = { id: "job", status: "queued", attempt: 0 };
  rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: job, error: null }));
  translate = vi.fn();
  mocks.identity.mockResolvedValue(identity);
  mocks.create.mockReturnValue({
    provider: "openai",
    translator: { translateDictionaryMeaning: translate },
  });
  mocks.service.mockReturnValue({
    supabase: {
      rpc,
      from: (table: string) => {
        const query: any = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: () => query,
          maybeSingle: async () => ({
            data: table === "word_entry_translations" ? cache : job,
            error: null,
          }),
        };
        return query;
      },
    },
  });
  mocks.legacy.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("queued dictionary translation request boundary", () => {
  test("enqueue returns pending without executing a provider and persists identities only", async () => {
    expect(await request(input)).toMatchObject({
      httpStatus: 200,
      payload: { status: "pending", job: { id: "job" } },
    });
    expect(translate).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "enqueue_dictionary_translation_job_v1",
      expect.objectContaining({
        p_word_entry_id: "entry",
        p_source_fingerprint: "fingerprint",
        p_priority: 10,
        p_refresh_ready: true,
      }),
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("secret source text");
  });
  test("valid complete cache reads perform no enqueue or provider work", async () => {
    cache = {
      status: "ready",
      source_fingerprint: "fingerprint",
      source_content_revision: "revision",
      translation_policy_version: "policy",
      overlay: { headword: "глаз", meanings: [{ definition: "орган чувств" }] },
    };
    expect(await request(input)).toMatchObject({
      cacheStatus: "hit",
      payload: { status: "ready" },
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(translate).not.toHaveBeenCalled();
  });
  test("an incomplete ready cache asks for fenced repair with its observed revision", async () => {
    cache = {
      status: "ready",
      updated_at: "2026-10-11T11:00:00Z",
      overlay: { headword: "глаз" },
    };
    await request(input);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_refresh_ready: true,
      p_observed_cache_updated_at: cache.updated_at,
    });
  });
  test("status observation is read-only; a missing job asks the client to enqueue again", async () => {
    job = null;
    expect(await request({ ...input, observeOnly: true })).toMatchObject({
      payload: { status: "pending", needsEnqueue: true },
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(translate).not.toHaveBeenCalled();
  });
  test("background intent does not acquire foreground priority", async () => {
    await request({ ...input, priority: 0 });
    expect(rpc.mock.calls[0][1].p_priority).toBe(0);
  });
  test("exhausted provider failure is closed and does not implicitly reset attempts", async () => {
    job = {
      id: "job",
      status: "failed",
      attempt: 3,
      error_code: "provider_timeout",
    };
    expect(await request(input)).toMatchObject({
      payload: {
        status: "failed",
        error: expect.stringMatching(/^provider_timeout:[a-f0-9]{24}$/),
      },
    });
    expect(rpc.mock.calls[0][1].p_retry_failed).toBe(false);
  });
  test("a changed source requests a new job rather than permanently failing the card", async () => {
    job = {
      id: "job",
      status: "failed",
      attempt: 1,
      error_code: "source_changed",
    };
    expect(await request({ ...input, observeOnly: true })).toMatchObject({
      payload: { status: "pending", needsEnqueue: true },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  test("disabled rollout retains the characterized synchronous contract", async () => {
    vi.stubEnv("DICTIONARY_TRANSLATION_JOBS_ENABLED", "false");
    mocks.legacy.mockResolvedValue({
      payload: { status: "ready" },
      httpStatus: 200,
      cacheStatus: "provider",
    });
    expect(await request(input)).toMatchObject({
      payload: { status: "ready" },
    });
    expect(mocks.legacy).toHaveBeenCalledWith(input);
    expect(rpc).not.toHaveBeenCalled();
  });
  test("a stalled database/source request is bounded well below a proxy deadline", async () => {
    vi.useFakeTimers();
    mocks.identity.mockReturnValue(new Promise(() => {}));
    const pending = request(input);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toMatchObject({
      httpStatus: 503,
      payload: { error: expect.stringMatching(/^provider_timeout:/) },
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
