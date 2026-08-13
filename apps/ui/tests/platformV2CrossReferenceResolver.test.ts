import { describe, expect, test, vi } from "vitest";
import { resolvePlatformV2CrossReferenceTargets } from "@/lib/platform/platformV2CrossReferenceResolver";

const source = {
  sourceEntryId: "entry-daar-2",
  sourceDictionaryId: "dict-vandale",
  query: "daar-",
};

describe("resolvePlatformV2CrossReferenceTargets", () => {
  test("projects the durable group identity for one exact source-owned target", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "lookup_platform_v2_entries") {
        return {
          data: {
            items: [
              entry("entry-other", "dict-other", "daar-"),
              entry("entry-target-1", "dict-vandale", "daar-"),
              entry("entry-target-2", "dict-vandale", "daar-"),
            ],
            page: { selectedTierComplete: true, nextGroupCursor: null },
          },
          error: null,
        };
      }
      return {
        data: {
          entries: [
            identity("entry-target-1", "group-daar-target"),
            identity("entry-target-2", "group-daar-target"),
          ],
        },
        error: null,
      };
    });

    const targets = await resolvePlatformV2CrossReferenceTargets(
      { supabase: { rpc } } as any,
      {
        sources: [source],
        userId: "user-1",
        catalog: false,
        contentLanguageCode: "nl",
      },
    );

    expect(targets.get(source.sourceEntryId)).toEqual({
      query: "daar-",
      headwordGroupId: "group-daar-target",
    });
  });

  test("keeps strict query fallback when exact homographs span groups", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "lookup_platform_v2_entries"
        ? {
            data: {
              items: [
                entry("entry-target-1", "dict-vandale", "daar-"),
                entry("entry-target-2", "dict-vandale", "daar-"),
              ],
              page: { selectedTierComplete: true, nextGroupCursor: null },
            },
            error: null,
          }
        : {
            data: {
              entries: [
                identity("entry-target-1", "group-daar-a"),
                identity("entry-target-2", "group-daar-b"),
              ],
            },
            error: null,
          },
    );

    const targets = await resolvePlatformV2CrossReferenceTargets(
      { supabase: { rpc } } as any,
      {
        sources: [source],
        userId: null,
        catalog: true,
        contentLanguageCode: "nl",
      },
    );

    expect(targets.get(source.sourceEntryId)).toEqual({ query: "daar-" });
  });

  test("keeps query fallback when the selected tier is incomplete", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        items: [entry("entry-target-1", "dict-vandale", "daar-")],
        page: {
          selectedTierComplete: false,
          nextGroupCursor: "more-groups",
        },
      },
      error: null,
    }));

    const targets = await resolvePlatformV2CrossReferenceTargets(
      { supabase: { rpc } } as any,
      {
        sources: [source],
        userId: null,
        catalog: true,
        contentLanguageCode: "nl",
      },
    );

    expect(targets.get(source.sourceEntryId)).toEqual({ query: "daar-" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  test("bounds lookup fan-out and leaves overflow as query fallbacks", async () => {
    const sources = Array.from({ length: 12 }, (_, index) => ({
      sourceEntryId: `source-${index}`,
      sourceDictionaryId: "dict-vandale",
      query: `target-${index}`,
    }));
    const rpc = vi.fn(async () => ({
      data: {
        items: [],
        page: { selectedTierComplete: true, nextGroupCursor: null },
      },
      error: null,
    }));

    const targets = await resolvePlatformV2CrossReferenceTargets(
      { supabase: { rpc } } as any,
      {
        sources,
        userId: null,
        catalog: true,
        contentLanguageCode: "nl",
      },
    );

    expect(rpc).toHaveBeenCalledTimes(8);
    expect(targets.get("source-11")).toEqual({ query: "target-11" });
  });
});

function entry(id: string, dictionaryId: string, headword: string) {
  return {
    id,
    dictionary_id: dictionaryId,
    language_code: "nl",
    headword,
    meaning_id: 1,
    part_of_speech: "bw",
    raw: { meanings: [{ definition: "target" }] },
  };
}

function identity(entryId: string, headwordGroupId: string) {
  return {
    entryId,
    headwordGroupId,
    meaningOrdinal: 1,
    contentNodeBindings: [],
  };
}
