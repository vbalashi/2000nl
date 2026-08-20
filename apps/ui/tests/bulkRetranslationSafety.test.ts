import { createRequire } from "node:module";
import { afterEach, describe, expect, test, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  bulkFailureRecords,
  openAITranslateWithRetries,
} = require("../scripts/retranslate-translations.js") as {
  bulkFailureRecords: (
    error: unknown,
    identity: Record<string, unknown>,
  ) => { log: Record<string, unknown>; db: Record<string, unknown> };
  openAITranslateWithRetries: (input: Record<string, unknown>) => Promise<unknown>;
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_MAX_RETRIES;
});

describe("bulk retranslation provider boundary", () => {
  test("never copies a provider body into its log or DB failure payload", async () => {
    const providerSecret = "bulk-provider-body-with-card-and-token";
    process.env.OPENAI_MAX_RETRIES = "0";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => providerSecret,
      })),
    );

    const error = await openAITranslateWithRetries({
      apiKey: "test-key",
      apiUrl: "https://provider.invalid",
      model: "test-model",
      texts: ["private card"],
      targetLang: "ru",
      context: {},
    }).catch((value: unknown) => value);
    const records = bulkFailureRecords(error, {
      word_entry_id: "entry-1",
      target_lang: "ru",
      provider: "openai",
    });

    expect(JSON.stringify(records)).not.toContain(providerSecret);
    expect(records.log.error).toMatch(
      /^provider_http_error:[a-f0-9]{24}$/,
    );
    expect(records.db.error_message).toBe(records.log.error);
  });
});
