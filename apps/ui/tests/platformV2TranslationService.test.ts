import { beforeEach, describe, expect, test, vi } from "vitest";
import { resolvePlatformV2Translations } from "@/lib/platform/platformV2TranslationService";
import {
  contentFingerprint,
  normalizeDictionaryContent,
} from "@/lib/platform/projections/dictionaryContent";
import { translationPolicyVersion } from "@/lib/translation/translationPolicy";

const translationQuery = (data: unknown[]) => {
  const query: any = {
    select: vi.fn(() => query),
    in: vi.fn(() => query),
    eq: vi.fn(() => query),
    then: (resolve: any, reject: any) =>
      Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return query;
};

describe("Platform V2 translation projection", () => {
  beforeEach(() => {
    process.env.TRANSLATION_PROVIDER = "openai";
  });

  test("fails closed when a cached overlay predates explicit content revision identity", async () => {
    const from = vi.fn(() =>
      translationQuery([
        {
          id: "translation-legacy-1",
          word_entry_id: "entry-1",
          target_lang: "ru",
          provider: "openai",
          status: "ready",
          overlay: {
            headword: "старый дом",
            meanings: [{ definition: "устаревший перевод" }],
          },
          source_content_revision: null,
          translation_policy_version: null,
          provider_revision: null,
          error_message: null,
        },
      ]),
    );

    const result = await resolvePlatformV2Translations(
      { supabase: { from } } as any,
      {
        entries: [
          {
            id: "entry-1",
            language_code: "nl",
            headword: "huis",
            part_of_speech: "zn",
            raw: {
              meanings: [{ definition: "een gebouw om in te wonen" }],
            },
          },
        ],
        bindingsByEntryId: new Map([
          [
            "entry-1",
            [
              {
                contentNodeId: "node-definition-1",
                sourcePath: "raw.meanings[0].definition",
                kind: "definition",
                sourceTextFingerprint: "current-definition-fingerprint",
              },
            ],
          ],
        ]),
        targetLanguageCode: "ru",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.byEntryId.get("entry-1")?.entryTranslation).toEqual(
      expect.objectContaining({
        translationId: "translation-legacy-1",
        status: "not-available",
        errorCode: "stale-source",
        isFresh: false,
      }),
    );
    expect(
      result.byEntryId.get("entry-1")?.nodeTranslationsById.size,
    ).toBe(0);
    expect(JSON.stringify(result)).not.toContain("устаревший перевод");
  });

  test("projects the same structured entry artifact for every V2 consumer", async () => {
    const entry = {
      id: "entry-1",
      language_code: "nl",
      headword: "goed",
      part_of_speech: "zn",
      raw: { meanings: [{ definition: "de stof; de kleren" }] },
    };
    const revision = contentFingerprint(normalizeDictionaryContent(entry as any));
    const from = vi.fn(() =>
      translationQuery([
        {
          id: "translation-1",
          word_entry_id: "entry-1",
          target_lang: "ru",
          provider: "openai",
          status: "ready",
          overlay: {
            headword: "бельё",
            entryTranslation: {
              primaryText: "бельё",
              alternativeTexts: ["одежда", "текстиль"],
              baseText: "товар",
              note: "Здесь имеется в виду одежда для стирки.",
            },
            meanings: [{ definition: "ткань; одежда" }],
          },
          source_content_revision: revision,
          translation_policy_version: translationPolicyVersion("openai"),
          provider_revision: "meaning-prompt-v1",
          error_message: null,
        },
      ]),
    );

    const result = await resolvePlatformV2Translations(
      { supabase: { from } } as any,
      {
        entries: [entry],
        bindingsByEntryId: new Map(),
        targetLanguageCode: "ru",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.byEntryId.get("entry-1")?.entryTranslation).toMatchObject({
      text: "бельё",
      alternativeTexts: ["одежда", "текстиль"],
      baseText: "товар",
      note: "Здесь имеется в виду одежда для стирки.",
    });
  });
});
