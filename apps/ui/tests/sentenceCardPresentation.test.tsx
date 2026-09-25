import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { buildSentenceCardPresentation } from "@/lib/training/sentenceCardPresentation";
import { resolveSentenceExerciseContent } from "@/lib/training/sentenceExerciseContent";
import { TrainingExerciseCard } from "@/components/training/v2/TrainingExerciseCard";
import { goedGroup } from "./platformV2IdiomHierarchyFixture";

function model() {
  const content = resolveSentenceExerciseContent({
    entryId: "entry-goed", contentNodeId: "idiom-example-goed", sourceTextFingerprint: "fingerprint-idiom-example-goed",
  }, structuredClone(goedGroup))!;
  content.sentence.translations = [{
    translationId: "ru-example", targetLanguageCode: "ru", status: "ready", text: "Деньги пойдут на помощь пострадавшим.",
    sourceTextFingerprint: content.sentence.sourceTextFingerprint, translationPolicyVersion: "v1",
  }];
  return { content, presentation: buildSentenceCardPresentation({ content, interfaceLanguage: "en", translationTargetLanguageCode: "ru" })! };
}

test("shows only the selected example after reveal, with its translation already visible", () => {
  const { content, presentation } = model();
  function Card() {
    const [revealed, setRevealed] = React.useState(false);
    return <TrainingExerciseCard presentation={presentation} interfaceLanguage="en" revealed={revealed} onReveal={() => setRevealed(true)} busy={false} onGrade={vi.fn()} />;
  }
  render(<Card />);
  expect(screen.getByText(presentation.prompt.text)).toBeVisible();
  expect(screen.queryByText(content.sentence.text)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
  expect(screen.getByText(content.sentence.text)).toBeVisible();
  expect(screen.getByText(presentation.prompt.text)).toBeVisible();
  expect(presentation.answer.examples.map((node) => node.contentNodeId)).toEqual([content.sentence.contentNodeId]);
  expect(presentation.answer.definitions).toEqual([]);
  expect(screen.getByRole("button", { name: "Again" })).toHaveFocus();
});

test("a missing target-language translation cannot expose the original sentence as a prompt", () => {
  const { content } = model();
  expect(buildSentenceCardPresentation({ content, interfaceLanguage: "en", translationTargetLanguageCode: "de" })).toBeNull();
});
