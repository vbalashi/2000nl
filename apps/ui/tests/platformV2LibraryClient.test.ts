import { afterEach, describe, expect, test, vi } from "vitest";
import {
  fetchPlatformV2LibraryGroupPage,
  fetchPlatformV2CrossReferenceTarget,
  selectPlatformV2CrossReferenceTarget,
  selectPlatformV2MultiSenseGroup,
} from "@/lib/platform/platformV2LibraryClient";
import {
  financeEntry,
  furnitureEntry,
  multiSenseBankGroup,
} from "./platformV2LibraryFixture";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const payload = {
  contractVersion: "platform-lookup-v2" as const,
  query: "bank",
  request: {
    contentLanguageCode: "nl",
    translationTargetLanguageCode: "en",
    cardTypeId: "word-to-definition",
    intent: "dictionary-lookup" as const,
  },
  groups: [multiSenseBankGroup],
  page: { selectedTierComplete: true, nextGroupCursor: null },
};

describe("selectPlatformV2MultiSenseGroup", () => {
  test("selects the server group containing the exact selected entry", () => {
    expect(
      selectPlatformV2MultiSenseGroup(payload, financeEntry.entryId),
    ).toBe(multiSenseBankGroup);
  });

  test("does not replace the existing single-sense detail experience", () => {
    expect(
      selectPlatformV2MultiSenseGroup(
        {
          ...payload,
          groups: [
            {
              ...multiSenseBankGroup,
              senseCount: 1,
              entryCount: 1,
              entries: [furnitureEntry],
            },
          ],
        },
        furnitureEntry.entryId,
      ),
    ).toBeNull();
  });

  test("never falls back to matching by ordinal or headword", () => {
    expect(selectPlatformV2MultiSenseGroup(payload, "missing-entry")).toBeNull();
  });

  test("selects an exact pointer-only Library detail without making it a sense", () => {
    const pointerGroup = {
      ...multiSenseBankGroup,
      senseCount: 0,
      entryCount: 1,
      entries: [
        {
          kind: "cross-reference" as const,
          crossReferenceId: "entry-daar-2",
          label: {
            termId: "cross-reference.see",
            messageKey: "crossReference.see",
          },
          text: "daar-",
          target: { query: "daar-" },
          capabilities: [
            {
              actionId: "follow-cross-reference" as const,
              elementId: "cross-reference.follow",
              messageKey: "crossReference.follow",
            },
          ],
        },
      ],
    };

    expect(
      selectPlatformV2MultiSenseGroup(
        { ...payload, query: "daar", groups: [pointerGroup] },
        "entry-daar-2",
      ),
    ).toBe(pointerGroup);
  });

  test("accepts a real single-sense group after following a cross-reference", () => {
    const targetGroup = {
      ...multiSenseBankGroup,
      senseCount: 1,
      entryCount: 1,
      entries: [furnitureEntry],
    };

    expect(
      selectPlatformV2CrossReferenceTarget({
        ...payload,
        query: "daar-",
        groups: [targetGroup],
      }),
    ).toBe(targetGroup);
  });

  test("looks up the pointer query and returns the full target group", async () => {
    const targetGroup = {
      ...multiSenseBankGroup,
      header: { ...multiSenseBankGroup.header, text: "daar-" },
      senseCount: 1,
      entryCount: 1,
      entries: [furnitureEntry],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...payload,
          query: "daar-",
          groups: [targetGroup],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchPlatformV2CrossReferenceTarget({
        query: "daar-",
        cardTypeId: "word-to-definition",
        contentLanguageCode: "nl",
        translationTargetLanguageCode: "en",
      }),
    ).resolves.toEqual(targetGroup);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/platform/v2/lookup",
      expect.objectContaining({
        body: JSON.stringify({
          query: "daar-",
          cardTypeId: "word-to-definition",
          contentLanguageCode: "nl",
          translationTargetLanguageCode: "en",
          intent: "dictionary-lookup",
        }),
      }),
    );
    expect(furnitureEntry.contentNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "definition" }),
        expect.objectContaining({ kind: "example" }),
      ]),
    );
  });
});

describe("fetchPlatformV2LibraryGroupPage", () => {
  test("requests the next opaque group page without supplying an entry limit", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...payload,
        query: "goed",
        page: {
          selectedTierComplete: true,
          nextGroupCursor: "next-group-page",
        },
      }),
    } as Response);

    try {
      const page = await fetchPlatformV2LibraryGroupPage({
        query: "goed",
        cardTypeId: "word-to-definition",
        contentLanguageCode: "nl",
        translationTargetLanguageCode: "en",
        cursor: "current-group-page",
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/platform/v2/lookup",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            query: "goed",
            cardTypeId: "word-to-definition",
            contentLanguageCode: "nl",
            translationTargetLanguageCode: "en",
            intent: "dictionary-lookup",
            cursor: "current-group-page",
          }),
        }),
      );
      expect(page?.groups).toBe(payload.groups);
      expect(page?.nextGroupCursor).toBe("next-group-page");
    } finally {
      fetchMock.mockRestore();
    }
  });
});
