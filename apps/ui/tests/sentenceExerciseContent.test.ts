import { describe, expect, test } from "vitest";
import { resolveSentenceExerciseContent, resolveSentencePrompt } from "@/lib/training/sentenceExerciseContent";
import { goedGroup } from "./platformV2IdiomHierarchyFixture";

const target = {
  entryId: "entry-goed",
  contentNodeId: "idiom-example-goed",
  sourceTextFingerprint: "fingerprint-idiom-example-goed",
};

function fixture() {
  const content = resolveSentenceExerciseContent(target, structuredClone(goedGroup));
  if (!content) throw new Error("Expected source example");
  content.sentence.translations = [{
    translationId: "translation-ru",
    targetLanguageCode: "ru",
    status: "ready",
    text: "Деньги пойдут на помощь пострадавшим.",
    sourceTextFingerprint: target.sourceTextFingerprint,
    translationPolicyVersion: "v1",
  }];
  return content;
}

describe("sentence exercise source and prompt", () => {
  test("resolves the exact nested example while preserving the full entry for details/report", () => {
    const content = fixture();
    expect(content.sentence.contentNodeId).toBe(target.contentNodeId);
    expect(content.entry.contentNodes.length).toBeGreaterThan(1);
    expect(content.sentence.parentContentNodeId).toBe("idiom-goed");
    expect(resolveSentencePrompt(content, "ru")).toMatchObject({ status: "ready", translationId: "translation-ru" });
  });

  test("rejects changed source, wrong entry and a non-example node", () => {
    expect(resolveSentenceExerciseContent({ ...target, sourceTextFingerprint: "old" }, goedGroup)).toBeNull();
    expect(resolveSentenceExerciseContent({ ...target, entryId: "other-entry" }, goedGroup)).toBeNull();
    expect(resolveSentenceExerciseContent({ ...target, contentNodeId: "idiom-goed", sourceTextFingerprint: "fingerprint-idiom-goed" }, goedGroup)).toBeNull();
  });

  test("language switching never borrows another language or changes source identity", () => {
    const content = fixture();
    expect(resolveSentencePrompt(content, "en")).toEqual({ status: "missing" });
    expect(resolveSentencePrompt(content, "ru").status).toBe("ready");
    expect(content.sentence.contentNodeId).toBe(target.contentNodeId);
  });

  test("a stale translation needs preparation rather than invalidating the source", () => {
    const content = fixture();
    content.sentence.translations[0].sourceTextFingerprint = "old";
    expect(resolveSentencePrompt(content, "ru")).toEqual({ status: "missing" });
    expect(resolveSentenceExerciseContent(target, content.group)).not.toBeNull();
  });

  test.each(["pending", "failed", "not-available"] as const)("%s translation never becomes an answerable prompt", (status) => {
    const content = fixture();
    content.sentence.translations[0].status = status;
    expect(resolveSentencePrompt(content, "ru")).toEqual({ status });
  });

  test("rejects blank and ambiguous translations instead of guessing", () => {
    const content = fixture();
    content.sentence.translations[0].text = "  ";
    expect(resolveSentencePrompt(content, "ru")).toEqual({ status: "missing" });
    content.sentence.translations.push({ ...content.sentence.translations[0], translationId: "second" });
    expect(resolveSentencePrompt(content, "ru")).toEqual({ status: "ambiguous" });
  });
});
