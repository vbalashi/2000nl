import { buildDictionaryMeaningTranslationRequest } from "@/lib/translation/dictionaryMeaningTranslationContract";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  executeClaimedDictionaryTranslationJob as run,
  type DictionaryTranslationJob,
} from "@/lib/translation/dictionaryTranslationJobWorker";
const job: DictionaryTranslationJob = {
  id: "job",
  word_entry_id: "entry",
  target_lang: "ru",
  provider: "openai",
  source_fingerprint: "source",
  source_content_revision: "revision",
  source_row_revision: "row-revision",
  translation_policy_version: "policy",
  provider_revision: "prompt",
  lease_token: "lease",
  attempt: 1,
  created_at: new Date().toISOString(),
  available_at: new Date().toISOString(),
};
const result = {
  request: buildDictionaryMeaningTranslationRequest({
    entryId: "entry",
    sourceContentFingerprint: "revision",
    sourceLanguageCode: "nl",
    targetLanguageCode: "ru",
    word: {
      headword: "oog",
      raw: { meanings: [{ definition: "een zintuig" }] },
    },
  }),
  overlay: { headword: "глаз", meanings: [{ definition: "орган чувств" }] },
  note: null,
};
afterEach(() => {
  vi.useRealTimers();
});
describe("translation worker execution lifetime", () => {
  test("publishes only through the fenced completion RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    expect(
      await run({ client: { rpc }, job, execute: async () => result }),
    ).toBe("ready");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("complete_dictionary_translation_job_v1", {
      p_job_id: "job",
      p_lease_token: "lease",
      p_overlay: result.overlay,
      p_note: null,
    });
  });
  test("heartbeat failure forbids publication after a late successful provider response", async () => {
    vi.useFakeTimers();
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    let resolve!: (value: typeof result) => void;
    const pending = run({
      client: { rpc },
      job,
      execute: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    await vi.advanceTimersByTimeAsync(20_000);
    resolve(result);
    expect(await pending).toBe("lease_lost");
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      "heartbeat_dictionary_translation_job_v1",
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });
  test("an unresponsive heartbeat cannot hang shutdown or allow publication", async () => {
    vi.useFakeTimers();
    const rpc = vi.fn(() => new Promise<any>(() => {}));
    let resolve!: (value: typeof result) => void;
    const pending = run({
      client: { rpc },
      job,
      execute: () =>
        new Promise((r) => {
          resolve = r;
        }),
      rpcTimeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(20_100);
    resolve(result);
    expect(await pending).toBe("lease_lost");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  test("provider failure schedules server retry with a closed code and no raw diagnostics", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    expect(
      await run({
        client: { rpc },
        job,
        execute: async () => {
          throw new Error("secret prompt and credentials");
        },
      }),
    ).toBe("failed");
    expect(rpc.mock.calls[0]).toEqual([
      "fail_dictionary_translation_job_v1",
      {
        p_job_id: "job",
        p_lease_token: "lease",
        p_error_code: "provider_unknown_error",
        p_retryable: true,
      },
    ]);
  });
  test.each(["missing field", "wrong source"])(
    "rejects %s before publishing cache",
    async (scenario) => {
      const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
      const invalid = structuredClone(result);
      if (scenario === "missing field") invalid.overlay.meanings = [];
      else invalid.request.sourceContentFingerprint = "another-source";
      expect(
        await run({ client: { rpc }, job, execute: async () => invalid }),
      ).toBe("failed");
      expect(rpc.mock.calls.map((call) => call[0])).toEqual([
        "fail_dictionary_translation_job_v1",
      ]);
    },
  );
  test("lost completion ownership is never reported ready", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    expect(
      await run({ client: { rpc }, job, execute: async () => result }),
    ).toBe("lease_lost");
  });
  test("an unconfirmed failure is reported and left for lease recovery", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error("database down") });
    await expect(
      run({
        client: { rpc },
        job,
        execute: async () => {
          throw new Error("provider error");
        },
      }),
    ).rejects.toThrow("translation_job_failure_unconfirmed");
  });
});
