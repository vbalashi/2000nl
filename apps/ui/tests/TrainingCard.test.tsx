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

test("D->W prompt uses fixed-width badge gutter so badge doesn't crowd prompt text", () => {
  const onWordClick = vi.fn();
  const wordWithMultipleMeanings = {
    id: "4",
    headword: "toe",
    part_of_speech: "bw",
    meanings_count: 2,
    raw: {
      meanings: [
        {
          definition: "tot",
          examples: ["Ik ga toe naar huis."],
          links: []
        },
        {
          definition: "erbij",
          examples: [],
          links: []
        }
      ]
    }
  };

  render(
    <TrainingCard
      word={wordWithMultipleMeanings as any}
      mode="definition-to-word"
      revealed={false}
      hintRevealed={false}
      onWordClick={onWordClick}
      userId="test-user"
      translationLang={null}
    />
  );

  // Badge "1" exists in the prompt in D->W mode. Its wrapper should have a fixed width.
  const badge = screen.getByText("1");
  const badgeColumn = badge.closest("div.w-12");
  expect(badgeColumn).toBeTruthy();
  expect(badgeColumn).toHaveClass("w-12");
});

test("W->D headword layout allows wrapping without misaligning gender/article", () => {
  const onWordClick = vi.fn();
  const articleWord = {
    id: "5",
    headword: "rekening",
    part_of_speech: "zn",
    gender: "de",
    raw: {
      meanings: [
        {
          definition: "factuur",
          examples: [],
          links: [],
        },
      ],
    },
  };

  render(
    <TrainingCard
      word={articleWord as any}
      mode="word-to-definition"
      revealed={false}
      hintRevealed={false}
      onWordClick={onWordClick}
      userId="test-user"
      translationLang={null}
    />
  );

  const heading = screen.getByRole("heading", { name: "rekening" });
  expect(heading).toHaveClass("min-w-0");
  expect(within(heading).getByRole("button", { name: "rekening" })).toHaveClass(
    "min-w-0"
  );

  const headerRow = heading.closest("div.inline-flex");
  expect(headerRow).toBeTruthy();
  expect(within(headerRow as HTMLElement).getByText("de")).toHaveClass(
    "flex-shrink-0"
  );
});

test("D->W revealed examples include left padding so text doesn't hug the edge", () => {
  const onWordClick = vi.fn();
  const toeWord = {
    id: "6",
    headword: "toe",
    part_of_speech: "bw",
    meanings_count: 2,
    raw: {
      meanings: [
        {
          definition: "tot",
          examples: ["Ik ga toe naar huis."],
          links: [],
        },
        {
          definition: "erbij",
          examples: [],
          links: [],
        },
      ],
    },
  };

  render(
    <TrainingCard
      word={toeWord as any}
      mode="definition-to-word"
      revealed
      hintRevealed={false}
      onWordClick={onWordClick}
      userId="test-user"
      translationLang={null}
    />
  );

  const examplesSection = screen.getByText((_content, node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (!node.className.includes("px-2")) return false;
    return node.textContent?.includes("Ik ga toe naar huis.") ?? false;
  });
  expect(examplesSection).toHaveClass("px-2");
});

test("W->D hint examples include left padding so text doesn't hug the edge", () => {
  const onWordClick = vi.fn();
  const wordWithExample = {
    id: "7",
    headword: "toe",
    part_of_speech: "bw",
    meanings_count: 2,
    raw: {
      meanings: [
        {
          definition: "tot",
          examples: ["Ik ga toe naar huis."],
          links: [],
        },
        {
          definition: "erbij",
          examples: [],
          links: [],
        },
      ],
    },
  };

  render(
    <TrainingCard
      word={wordWithExample as any}
      mode="word-to-definition"
      revealed={false}
      hintRevealed
      onWordClick={onWordClick}
      userId="test-user"
      translationLang={null}
    />
  );

  const hintSection = screen.getByText((_content, node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (!node.className.includes("px-2")) return false;
    return node.textContent?.includes("Ik ga toe naar huis.") ?? false;
  });
  expect(hintSection).toHaveClass("px-2");
});
