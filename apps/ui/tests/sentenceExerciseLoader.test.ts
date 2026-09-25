import { beforeEach, expect, test, vi } from "vitest";
import { prepareSentenceExerciseTranslation } from "@/lib/training/sentenceExerciseLoader";
import {
  fetchPlatformV2LibraryGroup,
  requestPlatformV2LibraryTranslation,
} from "@/lib/platform/platformV2LibraryClient";
import { goedGroup } from "./platformV2IdiomHierarchyFixture";

vi.mock("@/lib/platform/platformV2LibraryClient", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/platform/platformV2LibraryClient")>();
  return {
    ...original,
    fetchPlatformV2LibraryGroup: vi.fn(),
    requestPlatformV2LibraryTranslation: vi.fn(),
  };
});

const entryId = "entry-goed";
const contentNodeId = "idiom-example-goed";

beforeEach(() => {
  vi.clearAllMocks();
});

test("sentence lookahead reuses an exact ready translation without generation", async () => {
  const group = structuredClone(goedGroup);
  const entry = group.entries.find(
    (item) => item.kind === "sense-card" && item.entryId === entryId,
  );
  if (!entry || entry.kind !== "sense-card") throw new Error("fixture sense missing");
  const sentence = entry.contentNodes.find(
    (node) => node.contentNodeId === contentNodeId,
  )!;
  sentence.translations = [{
    translationId: "translation-ready",
    targetLanguageCode: "ru",
    status: "ready",
    text: "Готовый перевод.",
    sourceTextFingerprint: sentence.sourceTextFingerprint,
    translationPolicyVersion: "v1",
  }];
  vi.mocked(fetchPlatformV2LibraryGroup).mockResolvedValue(group);

  await expect(prepareSentenceExerciseTranslation({
    entryId, contentNodeId, contentLanguageCode: "nl",
    translationTargetLanguageCode: "ru",
  })).resolves.toEqual({ state: "ready" });
  expect(requestPlatformV2LibraryTranslation).not.toHaveBeenCalled();
});

test("sentence lookahead requests a missing translation for only that member entry", async () => {
  const group = structuredClone(goedGroup);
  const entry = group.entries.find(
    (item) => item.kind === "sense-card" && item.entryId === entryId,
  );
  if (!entry || entry.kind !== "sense-card") throw new Error("fixture sense missing");
  const sentence = entry.contentNodes.find(
    (node) => node.contentNodeId === contentNodeId,
  )!;
  sentence.translations = [];
  entry.capabilities = [
    ...(entry.capabilities ?? []),
    {
      actionId: "request-translation" as const,
      elementId: "translate-entry-goed",
      messageKey: "senseCard.translation.request",
      target: { kind: "entry" as const, entryId, contentRevision: entry.contentRevision },
      targetLanguageCode: "ru",
    },
  ];
  vi.mocked(fetchPlatformV2LibraryGroup).mockResolvedValue(group);
  vi.mocked(requestPlatformV2LibraryTranslation).mockResolvedValue("ready");

  await expect(prepareSentenceExerciseTranslation({
    entryId, contentNodeId, contentLanguageCode: "nl",
    translationTargetLanguageCode: "ru",
  })).resolves.toEqual({ state: "ready" });
  expect(requestPlatformV2LibraryTranslation).toHaveBeenCalledTimes(1);
  expect(requestPlatformV2LibraryTranslation).toHaveBeenCalledWith({
    entryId,
    targetLanguageCode: "ru",
  });
});
