import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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

  fireEvent.click(screen.getByRole("heading", { name: "huis" }));
  expect(onRequestReveal).toHaveBeenCalledTimes(1);
});
