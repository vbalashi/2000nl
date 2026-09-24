import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { buildIdiomCardPresentation } from "@/lib/training/idiomCardPresentation";
import { resolveIdiomExerciseContent } from "@/lib/training/idiomExerciseContent";
import { TrainingExerciseCard } from "@/components/training/v2/TrainingExerciseCard";
import { goedGroup, nodigGroup } from "./platformV2IdiomHierarchyFixture";

const content = resolveIdiomExerciseContent(
  {
    entryId: "entry-goed",
    contentNodeId: "idiom-goed",
    sourceTextFingerprint: "fingerprint-idiom-goed",
  },
  goedGroup,
)!;
const build = (direction: "direct" | "reverse") =>
  buildIdiomCardPresentation({
    content,
    direction,
    interfaceLanguage: "en",
    translationTargetLanguageCode: null,
  });

function Exercise({ direction }: { direction: "direct" | "reverse" }) {
  const [revealed, setRevealed] = React.useState(false);
  return (
    <TrainingExerciseCard
      presentation={build(direction)}
      interfaceLanguage="en"
      revealed={revealed}
      onReveal={() => setRevealed(true)}
      busy={false}
      onGrade={vi.fn()}
    />
  );
}

describe("exercise card field bindings", () => {
  test("direct and reverse share the exact full answer; direction changes only the face", () => {
    expect(build("direct").answer).toEqual(build("reverse").answer);
    expect(build("direct").prompt).toEqual({
      kind: "expression",
      text: content.expression.text,
    });
    expect(build("reverse").prompt).toEqual({
      kind: "explanation",
      text: content.explanation.text,
    });
  });

  test.each(["direct", "reverse"] as const)(
    "%s hides the answer and example until reveal, with headword only on request",
    (direction) => {
      render(<Exercise direction={direction} />);
      const concealed =
        direction === "direct"
          ? content.explanation.text
          : content.expression.text;
      expect(screen.queryByText(concealed)).not.toBeInTheDocument();
      expect(
        screen.queryByText(content.examples[0].text),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(content.headword)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /show hint/i }));
      expect(screen.getByText(content.headword)).toBeVisible();
      expect(screen.queryByText(concealed)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
      expect(screen.getByText(content.expression.text)).toBeVisible();
      expect(screen.getByText(content.explanation.text)).toBeVisible();
      expect(screen.getByText(content.examples[0].text)).toBeVisible();
      expect(screen.getAllByTestId("training-sense-card-shell")).toHaveLength(
        1,
      );
      expect(
        screen.queryByTestId("training-face-scroll"),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Again" })).toHaveFocus();
    },
  );

  test("no ordinary definitions or sibling idioms enter the full answer", () => {
    const selected = resolveIdiomExerciseContent(
      {
        entryId: "entry-nodig",
        contentNodeId: "idiom-nodig-2",
        sourceTextFingerprint: "fingerprint-idiom-nodig-2",
      },
      nodigGroup,
    )!;
    const view = buildIdiomCardPresentation({
      content: selected,
      direction: "direct",
      interfaceLanguage: "en",
      translationTargetLanguageCode: null,
    });
    expect(view.answer.definitions).toEqual([]);
    expect(view.answer.examples.map((n) => n.contentNodeId)).toEqual([
      "idiom-nodig-2",
    ]);
    expect(
      view.answer.examples[0].children.map((n) => n.contentNodeId),
    ).toEqual([selected.explanation.contentNodeId]);
  });

  test("busy cards cannot reveal or submit", () => {
    const onGrade = vi.fn();
    render(
      <TrainingExerciseCard
        presentation={build("direct")}
        interfaceLanguage="en"
        revealed
        busy
        onReveal={vi.fn()}
        onGrade={onGrade}
      />,
    );
    for (const label of ["Again", "Hard", "Good", "Easy"]) {
      const button = screen.getByRole("button", { name: label });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(onGrade).not.toHaveBeenCalled();
  });
});

test("translations stay secondary and require the requested language and matching source fingerprint", () => {
  const translated = {
    ...content,
    explanation: {
      ...content.explanation,
      translations: [
        {
          translationId: "wrong-language",
          targetLanguageCode: "de",
          status: "ready" as const,
          text: "German",
          sourceTextFingerprint: content.explanation.sourceTextFingerprint,
          translationPolicyVersion: "test",
        },
        {
          translationId: "stale",
          targetLanguageCode: "ru",
          status: "ready" as const,
          text: "Stale",
          sourceTextFingerprint: "old",
          translationPolicyVersion: "test",
        },
        {
          translationId: "fresh",
          targetLanguageCode: "ru",
          status: "ready" as const,
          text: "Русский перевод",
          sourceTextFingerprint: content.explanation.sourceTextFingerprint,
          translationPolicyVersion: "test",
        },
      ],
    },
  };
  const presentation = buildIdiomCardPresentation({
    content: translated,
    direction: "reverse",
    interfaceLanguage: "en",
    translationTargetLanguageCode: "ru",
  });
  expect(presentation.prompt.text).toBe(content.explanation.text);
  expect(presentation.answer.examples[0].children[0].translation).toBe(
    "Русский перевод",
  );
  render(
    <TrainingExerciseCard
      presentation={presentation}
      interfaceLanguage="en"
      revealed
      onReveal={vi.fn()}
      busy={false}
      onGrade={vi.fn()}
    />,
  );
  expect(
    screen.getByText("Русский перевод").closest('[aria-hidden="true"]'),
  ).toBeInTheDocument();
  expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  expect(screen.queryByText("German")).not.toBeInTheDocument();
});
