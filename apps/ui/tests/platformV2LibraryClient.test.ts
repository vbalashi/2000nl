import { describe, expect, test } from "vitest";
import { selectPlatformV2MultiSenseGroup } from "@/lib/platform/platformV2LibraryClient";
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
