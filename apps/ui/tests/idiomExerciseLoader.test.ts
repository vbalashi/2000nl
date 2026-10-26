import { beforeEach, describe, expect, test, vi } from "vitest";
import { loadIdiomExerciseContent } from "@/lib/training/idiomExerciseLoader";
import {
  fetchPlatformV2LibraryGroup,
  PlatformV2LibraryLookupError,
} from "@/lib/platform/platformV2LibraryClient";
import { goedGroup } from "./platformV2IdiomHierarchyFixture";

vi.mock("@/lib/platform/platformV2LibraryClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform/platformV2LibraryClient")>();
  return { ...actual, fetchPlatformV2LibraryGroup: vi.fn() };
});

const input = {
  candidate: {
    entryId: "entry-goed",
    contentNodeId: "idiom-goed",
    sourceTextFingerprint: "fingerprint-idiom-goed",
  },
  contentLanguageCode: "nl",
  translationTargetLanguageCode: "ru",
};

describe("idiom exercise lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("loads public content without using ordinary card state as exercise identity", async () => {
    vi.mocked(fetchPlatformV2LibraryGroup).mockResolvedValue(goedGroup);

    const result = await loadIdiomExerciseContent(input);

    expect(fetchPlatformV2LibraryGroup).toHaveBeenCalledWith({
      entryId: "entry-goed",
      cardTypeId: "word-to-definition",
      contentLanguageCode: "nl",
      translationTargetLanguageCode: "ru",
      signal: undefined,
    });
    expect(result.state).toBe("ready");
    if (result.state === "ready") {
      expect(result.content.expression.contentNodeId).toBe("idiom-goed");
      expect(result.content.entry.card?.cardTypeId).toBe("word-to-definition");
    }
  });

  test("distinguishes missing content from revoked access", async () => {
    vi.mocked(fetchPlatformV2LibraryGroup).mockResolvedValueOnce(null);
    expect(await loadIdiomExerciseContent(input)).toEqual({ state: "entry-not-found" });

    vi.mocked(fetchPlatformV2LibraryGroup).mockRejectedValueOnce(
      new PlatformV2LibraryLookupError("http-error", 403),
    );
    expect(await loadIdiomExerciseContent(input)).toEqual({
      state: "dictionary-access-revoked",
    });
  });

  test("fails closed when content revision no longer matches the candidate", async () => {
    vi.mocked(fetchPlatformV2LibraryGroup).mockResolvedValue(goedGroup);
    expect(await loadIdiomExerciseContent({
      ...input,
      candidate: { ...input.candidate, sourceTextFingerprint: "stale" },
    })).toEqual({ state: "projection-missing" });
  });
});
