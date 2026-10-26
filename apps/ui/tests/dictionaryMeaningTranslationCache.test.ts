import { describe, expect, test } from "vitest";
import {
  newDictionaryMeaningTranslationClaimRevision,
  updateOwnedDictionaryMeaningTranslation,
} from "@/lib/translation/dictionaryMeaningTranslationCache";

describe("dictionary meaning translation completion ownership", () => {
  test("claim revisions retain time semantics", () => {
    const now = new Date("2026-08-13T18:00:00.123Z");
    const revision = newDictionaryMeaningTranslationClaimRevision(now);
    expect(revision).toBe("2026-08-13T18:00:00.123Z");
    expect(Date.parse(revision)).toBe(now.getTime());
  });

  test.each([
    "2026-08-13T18:00:00.123007Z",
    "2026-08-13T18:00:00.123007+00:00",
    "2026-08-13 18:00:00.123007+00",
  ])("a reclaimed revision advances past predecessor spelling %s", (previous) => {
    const now = new Date("2026-08-13T18:00:00.123Z");

    const revision = newDictionaryMeaningTranslationClaimRevision(
      now,
      previous,
    );
    expect(Date.parse(revision)).toBeGreaterThan(Date.parse(previous));
    expect(revision).toBe("2026-08-13T18:00:00.124Z");
  });

  test("a late obsolete completion cannot overwrite a newer exact-request claim", async () => {
    const row: Record<string, unknown> = {
      word_entry_id: "entry-1",
      target_lang: "ru",
      provider: "openai",
      source_fingerprint: "new-note-fingerprint",
      updated_at: "2026-08-13T18:00:01.000Z",
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
        claimUpdatedAt: "2026-08-13T18:00:00.000Z",
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
        claimUpdatedAt: "2026-08-13T18:00:01.000Z",
      },
      { status: "ready", overlay: { headword: "новый перевод" } },
    );
    expect(row).toMatchObject({
      source_fingerprint: "new-note-fingerprint",
      status: "ready",
      overlay: { headword: "новый перевод" },
    });
  });

  test("a late same-fingerprint worker cannot overwrite its lease successor", async () => {
    const row: Record<string, unknown> = {
      word_entry_id: "entry-1",
      target_lang: "ru",
      provider: "openai",
      source_fingerprint: "same-fingerprint",
      updated_at: "2026-08-13T18:00:15.000Z",
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
        sourceFingerprint: "same-fingerprint",
        claimUpdatedAt: "2026-08-13T18:00:15.000Z",
      },
      { status: "ready", overlay: { headword: "новый перевод" } },
    );
    await updateOwnedDictionaryMeaningTranslation(
      supabase,
      {
        wordEntryId: "entry-1",
        targetLanguageCode: "ru",
        provider: "openai",
        sourceFingerprint: "same-fingerprint",
        claimUpdatedAt: "2026-08-13T18:00:00.000Z",
      },
      { status: "failed", overlay: null },
    );

    expect(row).toMatchObject({
      source_fingerprint: "same-fingerprint",
      updated_at: "2026-08-13T18:00:15.000Z",
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
