import { describe, expect, test } from "vitest";
import { updateOwnedDictionaryMeaningTranslation } from "@/lib/translation/dictionaryMeaningTranslationCache";

describe("dictionary meaning translation completion ownership", () => {
  test("a late obsolete completion cannot overwrite a newer exact-request claim", async () => {
    const row: Record<string, unknown> = {
      word_entry_id: "entry-1",
      target_lang: "ru",
      provider: "openai",
      source_fingerprint: "new-note-fingerprint",
      status: "pending",
      overlay: null,
    };
    const supabase = inMemoryTranslationTable(row);

    await updateOwnedDictionaryMeaningTranslation(
      supabase,
      {
        wordEntryId: "entry-1",
        targetLanguageCode: "ru",
        provider: "openai",
        sourceFingerprint: "old-note-fingerprint",
      },
      { status: "ready", overlay: { headword: "старый перевод" } },
    );
    expect(row).toMatchObject({
      source_fingerprint: "new-note-fingerprint",
      status: "pending",
      overlay: null,
    });

    await updateOwnedDictionaryMeaningTranslation(
      supabase,
      {
        wordEntryId: "entry-1",
        targetLanguageCode: "ru",
        provider: "openai",
        sourceFingerprint: "new-note-fingerprint",
      },
      { status: "ready", overlay: { headword: "новый перевод" } },
    );
    expect(row).toMatchObject({
      source_fingerprint: "new-note-fingerprint",
      status: "ready",
      overlay: { headword: "новый перевод" },
    });
  });
});

function inMemoryTranslationTable(row: Record<string, unknown>) {
  return {
    from() {
      const filters = new Map<string, unknown>();
      let values: Record<string, unknown> = {};
      const query: any = {
        update(next: Record<string, unknown>) {
          values = next;
          return query;
        },
        eq(column: string, value: unknown) {
          filters.set(column, value);
          return query;
        },
        then(resolve: (value: unknown) => void) {
          if ([...filters].every(([column, value]) => row[column] === value)) {
            Object.assign(row, values);
          }
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return query;
    },
  };
}
