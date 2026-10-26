import { describe, expect, it } from "vitest";
import {
  parseDictionaryFilters,
  projectDictionaryMetadata,
  projectDictionaryRegistryPage,
  projectDictionaryRow,
  type DictionaryRecord,
} from "@/lib/admin/dictionaryContract";

const record = {
  id: "dict-1",
  slug: "long-sample-dictionary-key",
  name: "A very long dictionary name that remains intact in metadata",
  language_code: "nl",
  kind: "user",
  visibility: "shared",
  owner_user_id: "user-123",
  source_provider: null,
  source_version: null,
  schema_key: null,
  schema_version: null,
  is_editable: true,
  minimum_subscription_tier: null,
  description: null,
  created_at: null,
  updated_at: "2026-09-24T10:00:00.000Z",
  dictionary_schemas: null,
  raw: { privateEntryContent: "must never escape" },
} as unknown as DictionaryRecord;

describe("admin dictionary projections", () => {
  it("bounds and validates registry URL state", () => {
    const parsed = parseDictionaryFilters(
      new URLSearchParams("q=%20water%20&language=nl&kind=community&page=-1&pageSize=10"),
    );
    expect(parsed).toEqual({
      q: "water",
      language: "nl",
      kind: "",
      page: 1,
      pageSize: 25,
    });
    expect(parseDictionaryFilters(new URLSearchParams("page=999999999" )).page).toBe(10_000);
  });

  it("keeps supported visibility and kind values without inferring publication", () => {
    const projected = projectDictionaryRow(record);
    expect(projected.kind).toBe("user");
    expect(projected.visibility).toBe("shared");
    expect(projected.entryCount).toBeNull();
    expect(projected).not.toHaveProperty("raw");
    expect(projected).not.toHaveProperty("description");
  });

  it("projects only verified metadata and preserves missing values as unknown", () => {
    const projected = projectDictionaryMetadata(record);
    expect(projected.ownerId).toBe("user-123");
    expect(projected.schemaVersion).toBeNull();
    expect(projected.schemaTitle).toBeNull();
    expect(projected.sourceVersion).toBeNull();
    expect(projected.createdAt).toBeNull();
    expect(projected).not.toHaveProperty("raw");
    expect(projected).not.toHaveProperty("privateEntryContent");
  });

  it("does not mislabel unknown enum values as supported dictionary states", () => {
    const projected = projectDictionaryRow({ ...record, kind: "community", visibility: "draft" });
    expect(projected.kind).toBeNull();
    expect(projected.visibility).toBeNull();
  });

  it("uses one lookahead row for bounded next-page availability", () => {
    const filters = parseDictionaryFilters(new URLSearchParams("page=2&pageSize=25"));
    const rows = Array.from({ length: 26 }, (_, index) => ({
      ...record,
      id: `dict-${index}`,
    }));
    const page = projectDictionaryRegistryPage(rows, filters);
    expect(page.items).toHaveLength(25);
    expect(page.returned).toBe(25);
    expect(page.hasPrevious).toBe(true);
    expect(page.hasNext).toBe(true);
  });
});
