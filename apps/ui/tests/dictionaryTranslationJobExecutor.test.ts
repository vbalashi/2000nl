import { expect, test, vi } from "vitest";
import { dictionaryMeaningTranslationIdentity } from "@/lib/translation/dictionaryMeaningTranslationIdentity";
import { executeDictionaryTranslationJob } from "@/lib/translation/dictionaryTranslationJobExecutor";
import { dictionaryMeaningTranslationCoverage } from "@/lib/translation/dictionaryMeaningTranslationReadiness";
const provider = vi.hoisted(() => vi.fn());
vi.mock("@/lib/translation/translationProvider", () => ({
  createTranslator: () => ({
    provider: "openai",
    translator: { translateDictionaryMeaning: provider },
  }),
  loadTranslationConfigFromEnv: () => ({}),
}));
test("worker resumes durable parts after a failed part, then publishes only full aggregate", async () => {
  const word = {
    id: "entry",
    headword: "woord",
    language_code: "nl",
    raw: {
      meanings: [
        {
          definition: "definitie",
          examples: Array.from(
            { length: 140 },
            (_, i) => `zin ${i} ` + "a".repeat(550),
          ),
        },
      ],
    },
  };
  const identity = await dictionaryMeaningTranslationIdentity({
    wordEntryId: word.id,
    word,
    dbLang: "ru",
    provider: "openai",
  });
  const job = {
    id: "job",
    word_entry_id: word.id,
    target_lang: "ru",
    provider: "openai",
    source_fingerprint: identity.fingerprint,
    source_content_revision: identity.sourceContentRevision,
    source_row_revision: "row",
    translation_policy_version: identity.policyVersion,
    provider_revision: identity.providerRevision,
    lease_token: "lease",
    attempt: 1,
    created_at: "",
    available_at: "",
  } as const;
  const saved = new Map<string, any>();
  const client: any = {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: [...saved.values()], error: null }),
      }),
    }),
    rpc: vi.fn(async (name, args) => {
      if (name === "dictionary_translation_source_v1")
        return { data: { word, revision: "row" }, error: null };
      if (name === "checkpoint_dictionary_translation_part_v1") {
        saved.set(args.p_part_key, {
          part_key: args.p_part_key,
          part_fingerprint: args.p_part_fingerprint,
          result: args.p_result,
        });
        return { data: true, error: null };
      }
      throw Error("unexpected rpc");
    }),
  };
  provider.mockImplementation(async (request) => ({
    entryTranslation: {
      primaryText: "слово",
      alternativeTexts: [],
      baseText: null,
      note: null,
    },
    contentTranslations: request.content.map((f: any) => ({
      fieldId: f.fieldId,
      text: "перевод " + f.fieldId,
    })),
    meta: { providerUsed: "openai" },
  }));
  expect(await executeDictionaryTranslationJob(client, job)).toEqual({
    continuation: true,
  });
  expect(saved.size).toBe(1);
  const firstFields = provider.mock.calls[0][0].content.map(
    (f: any) => f.fieldId,
  );
  provider.mockRejectedValueOnce(new Error("temporary"));
  await expect(executeDictionaryTranslationJob(client, job)).rejects.toThrow(
    "temporary",
  );
  expect(saved.size).toBe(1);
  let result: any;
  for (let i = 0; i < 50; i++) {
    result = await executeDictionaryTranslationJob(client, job);
    if (!("continuation" in result)) break;
  }
  expect(result.request).toEqual(identity.request);
  expect(
    dictionaryMeaningTranslationCoverage(identity.request, result.overlay)
      .requestComplete,
  ).toBe(true);
  expect(result.overlay.meanings[0].examples).toHaveLength(140);
  expect(
    provider.mock.calls
      .slice(1)
      .every(
        (call) =>
          JSON.stringify(call[0].content.map((f: any) => f.fieldId)) !==
          JSON.stringify(firstFields),
      ),
  ).toBe(true);
  expect(
    client.rpc.mock.calls.every(
      (call: any) => call[0] !== "complete_dictionary_translation_job_v1",
    ),
  ).toBe(true);
});

test("coordinated emergency rollback retains v3 identity and bypasses the parts store", async () => {
  vi.stubEnv("DICTIONARY_TRANSLATION_FULL_SOURCE_ENABLED", "false");
  try {
    const word = {
      id: "entry",
      headword: "woord",
      language_code: "nl",
      raw: {
        meanings: [
          {
            definition: "definitie",
            examples: Array.from(
              { length: 140 },
              (_, i) => `zin ${i} ` + "a".repeat(550),
            ),
          },
        ],
      },
    };
    const identity = await dictionaryMeaningTranslationIdentity({
      wordEntryId: word.id,
      word,
      dbLang: "ru",
      provider: "openai",
    });
    expect(identity.policyVersion).toContain(
      "dictionary_meaning_full_budget_v3:",
    );
    expect(identity.request.content.length).toBeLessThan(141);
    const job: any = {
      id: "job",
      word_entry_id: word.id,
      target_lang: "ru",
      provider: "openai",
      source_fingerprint: identity.fingerprint,
      source_content_revision: identity.sourceContentRevision,
      source_row_revision: "row",
      translation_policy_version: identity.policyVersion,
      provider_revision: identity.providerRevision,
      lease_token: "lease",
    };
    const from = vi.fn();
    const client: any = {
      from,
      rpc: vi.fn(async () => ({
        data: { word, revision: "row" },
        error: null,
      })),
    };
    const result = await executeDictionaryTranslationJob(client, job);
    expect("request" in result).toBe(true);
    expect(from).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});
