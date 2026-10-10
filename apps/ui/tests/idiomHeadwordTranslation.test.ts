import { describe, expect, test } from "vitest";
import { idiomHeadwordTranslation } from "@/lib/training/idiomHeadwordTranslation";
import { resolveIdiomExerciseContent } from "@/lib/training/idiomExerciseContent";
import { buildIdiomCardPresentation } from "@/lib/training/idiomCardPresentation";
import { goedGroup, goedEntry } from "./platformV2IdiomHierarchyFixture";
import type { PlatformEntryTranslationStateV2, PlatformSenseCardEntryV2 } from "../../../packages/shared/types/platformV2";

const fresh: PlatformEntryTranslationStateV2 = {
  translationId: "translation-goed", entryId: goedEntry.entryId,
  targetLanguageCode: "ru", status: "ready", text: "добро",
  alternativeTexts: ["благо"], baseText: null, note: null,
  sourceContentFingerprint: goedEntry.contentRevision,
  translationPolicyVersion: "test", isFresh: true,
};
function content(translation: PlatformEntryTranslationStateV2 | null = fresh) {
  return resolveIdiomExerciseContent({
    entryId: goedEntry.entryId, contentNodeId: "idiom-goed",
    sourceTextFingerprint: "fingerprint-idiom-goed",
  }, { ...goedGroup, entries: [{ ...goedEntry, translation }] })!;
}

describe("idiom headword translation", () => {
  test("uses the exact standalone meaning and retains useful equivalents", () => {
    expect(idiomHeadwordTranslation(content(), "ru")).toEqual({ text: "добро", alternatives: ["благо"] });
  });
  test("keeps a context-free base separate from contextual alternatives", () => {
    expect(idiomHeadwordTranslation(content({ ...fresh, baseText: "хороший" }), "ru"))
      .toEqual({ text: "хороший", alternatives: [] });
  });
  test.each([
    { status: "pending" as const }, { status: "failed" as const },
    { isFresh: false }, { sourceContentFingerprint: "old" },
    { entryId: "another-entry" }, { targetLanguageCode: "de" }, { text: undefined },
  ])("rejects unavailable, stale or unrelated translation %j", (patch) => {
    expect(idiomHeadwordTranslation(content({ ...fresh, ...patch }), "ru")).toBeNull();
  });
  test("does not expose translations with no selected language", () => {
    expect(idiomHeadwordTranslation(content(), null)).toBeNull();
  });
  test.each(["direct", "reverse"] as const)("%s answer includes headword translation without adding sibling content", (direction) => {
    const view = buildIdiomCardPresentation({ content: content(), direction,
      interfaceLanguage: "ru", translationTargetLanguageCode: "ru" });
    expect(view.answer.entryTranslation).toBe("добро");
    expect(view.answer.entryTranslationAlternatives).toEqual(["благо"]);
    expect(view.answer.definitions).toEqual([]);
    expect(view.answer.examples.map(n => n.contentNodeId)).toEqual(["idiom-goed"]);
  });
  test("idiom-only entry uses the first standalone sense of the same POS by ordinal", () => {
    const selected = content();
    selected.entry = { ...selected.entry, contentNodes: selected.entry.contentNodes.filter(n => n.kind !== "definition"), translation: null };
    const standalone = (id: string, ordinal: number, text: string): PlatformSenseCardEntryV2 => ({
      ...goedEntry, entryId: id, meaningOrdinal: ordinal,
      translation: { ...fresh, entryId: id, text, alternativeTexts: [] },
    });
    const first = standalone("first", 1, "основное");
    selected.group = { ...selected.group, entries: [
      standalone("later", 2, "другое"),
      { ...standalone("wrong-pos", 0, "чужое"), partOfSpeech: { termId: "noun", messageKey: "noun" } },
      selected.entry, first,
    ] };
    expect(idiomHeadwordTranslation(selected, "ru")?.text).toBe("основное");
    first.translation = null;
    expect(idiomHeadwordTranslation(selected, "ru")).toBeNull();
    selected.group = { ...selected.group, entries: [selected.entry] };
    expect(idiomHeadwordTranslation(selected, "ru")).toBeNull();
  });
});
