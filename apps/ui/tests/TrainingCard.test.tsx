import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { TrainingCard } from "@/components/training/TrainingCard";

const word = {
  id: "1",
  headword: "huis",
  part_of_speech: "substantief",
  gender: "het",
  raw: {
    meanings: [
      {
        definition: "Een gebouw waar mensen wonen.",
        examples: ["Het grote huis aan de gracht staat al eeuwen."],
        links: [{ label: "gracht", headword: "gracht" }]
      }
    ]
  }
};

test("renders headword and definition segments", () => {
  const onClick = vi.fn();
  render(
    <TrainingCard
      word={word as any}
      mode="word-to-definition"
      revealed
      hintRevealed={false}
      onWordClick={onClick}
      userId="test-user"
      translationLang={null}
    />
  );

  expect(screen.getByRole("heading", { name: "huis" })).toBeInTheDocument();
  expect(document.body).toHaveTextContent("Een gebouw waar mensen wonen.");
  expect(document.body).toHaveTextContent(
    "Het grote huis aan de gracht staat al eeuwen."
  );
  expect(screen.getByRole("button", { name: /gracht/i })).toBeInTheDocument();
});

test("headword click requests audio playback", () => {
  const onWordClick = vi.fn();
  render(
    <TrainingCard
      word={word as any}
      mode="word-to-definition"
      revealed
      hintRevealed={false}
      onWordClick={onWordClick}
      userId="test-user"
      translationLang={null}
    />
  );

  const heading = screen.getByRole("heading", { name: "huis" });
  fireEvent.click(within(heading).getByRole("button", { name: "huis" }));
  expect(onWordClick).toHaveBeenCalledWith("huis", { forceAudio: true });
});

test("tap/clicking card requests reveal when not revealed", () => {
  const onWordClick = vi.fn();
  const onRequestReveal = vi.fn();

  render(
    <TrainingCard
      word={word as any}
      mode="word-to-definition"
      revealed={false}
      hintRevealed={false}
      onWordClick={onWordClick}
      userId="test-user"
      translationLang={null}
      onRequestReveal={onRequestReveal}
    />
  );

  fireEvent.click(screen.getByRole("group", { name: "Training card" }));
  expect(onRequestReveal).toHaveBeenCalledTimes(1);
});

test("hides perfect participle in auxiliary metadata (W->D revealed)", () => {
  const onWordClick = vi.fn();
  const verbWord = {
    id: "2",
    headword: "vertrekken",
    part_of_speech: "ww",
    raw: {
      meanings: [
        {
          definition: "( heeft vertrokken ) weggaan",
          examples: [],
          links: []
        }
      ]
    }
  };

  render(
    <TrainingCard
      word={verbWord as any}
      mode="word-to-definition"
      revealed
      hintRevealed={false}
      onWordClick={onWordClick}
      userId="test-user"
      translationLang={null}
    />
  );

  expect(document.body).toHaveTextContent("( heeft ... ) weggaan");
  expect(document.body).not.toHaveTextContent("vertrokken");
});

test("hides perfect participle in auxiliary metadata (D->W prompt)", () => {
  const onWordClick = vi.fn();
  const verbWord = {
    id: "3",
    headword: "vertrekken",
    part_of_speech: "ww",
    raw: {
      meanings: [
        {
          definition: "( is vertrokken ) weggelopen",
          examples: [],
          links: []
        }
      ]
    }
  };

  render(
    <TrainingCard
      word={verbWord as any}
      mode="definition-to-word"
      revealed={false}
      hintRevealed={false}
      onWordClick={onWordClick}
      userId="test-user"
      translationLang={null}
    />
  );

  expect(document.body).toHaveTextContent("( is ... ) weggelopen");
  expect(document.body).not.toHaveTextContent("vertrokken");
});
