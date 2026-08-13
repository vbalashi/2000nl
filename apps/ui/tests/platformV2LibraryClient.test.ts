import { describe, expect, test, vi } from "vitest";
import {
  fetchPlatformV2LibraryGroupPage,
  selectPlatformV2MultiSenseGroup,
} from "@/lib/platform/platformV2LibraryClient";
import {
  financeEntry,
  furnitureEntry,
  multiSenseBankGroup,
} from "./platformV2LibraryFixture";

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
