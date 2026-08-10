import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import {
  TrainingTodaySetup,
  type TrainingSetupDraft,
} from "@/components/training/pilot/TrainingTodaySetup";

const initialDraft: TrainingSetupDraft = {
  scenarioId: "understanding",
  modes: ["word-to-definition"],
  cardFilter: "both",
  listValue: "curated:nt2",
  newReviewRatio: 2,
  dateWindow: "all",
  sourceValue: "all",
};

const baseProps = {
  interfaceLanguage: "en" as const,
  status: "ready" as const,
  initialDraft,
  stats: {
    newWordsToday: 4,
    newCardsToday: 5,
    dailyNewLimit: 10,
    reviewWordsDone: 6,
    reviewCardsDone: 7,
    reviewWordsDue: 8,
    reviewCardsDue: 9,
    totalWordsLearned: 120,
    totalWordsInList: 2000,
  },
  scenarios: [
    {
      value: "understanding",
      label: "Meaning",
      modes: ["word-to-definition" as const, "definition-to-word" as const],
    },
    {
      value: "listening",
      label: "Listening",
      modes: ["listen-recognize" as const],
    },
  ],
  lists: [{ value: "curated:nt2", label: "NT2 2000" }],
  sources: [{ value: "source:video-1", label: "Dutch lesson 1" }],
  onContinue: vi.fn(),
  onStart: vi.fn(),
  onRetry: vi.fn(),
};

test("Today keeps the mounted session behind an explicit Continue action", () => {
  const onContinue = vi.fn();
  render(<TrainingTodaySetup {...baseProps} onContinue={onContinue} />);

  expect(
    screen.getByRole("heading", { name: "Good morning" }),
  ).toBeInTheDocument();
  expect(screen.getByText("12 cards completed today")).toBeInTheDocument();
  expect(
    screen.getByText("9 reviews due · 4/10 new today"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Continue session" }));
  expect(onContinue).toHaveBeenCalledOnce();
});

test("Setup is a draft: Back discards changes and Start applies one selection", () => {
  const onStart = vi.fn<[TrainingSetupDraft], void>();
  render(<TrainingTodaySetup {...baseProps} onStart={onStart} />);

  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  expect(screen.getByRole("button", { name: "Listening" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reverse" }));
  expect(screen.getByRole("button", { name: "Meaning" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Reverse" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "New" }));
  expect(screen.getByRole("button", { name: "New" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.getByRole("button", { name: "Reviews" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    screen.getByRole("button", { name: "1 new · 3 review" }),
  ).toBeDisabled();
  expect(onStart).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Back to Today" }));
  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  expect(screen.getByRole("button", { name: "Meaning" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "New" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Reviews" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  fireEvent.click(screen.getByRole("button", { name: "Reverse" }));
  expect(screen.getByRole("button", { name: "Reverse" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "New" }));
  fireEvent.click(screen.getByRole("button", { name: "New" }));
  fireEvent.click(screen.getByRole("button", { name: "1 new · 3 review" }));
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));

  expect(onStart).toHaveBeenCalledOnce();
  expect(onStart).toHaveBeenCalledWith({
    ...initialDraft,
    scenarioId: "understanding",
    cardFilter: "both",
    modes: ["word-to-definition", "definition-to-word"],
    newReviewRatio: 3,
  });
});

test("pending Start cannot be submitted twice", () => {
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} startPending onStart={onStart} />);

  expect(screen.getByRole("button", { name: "Starting…" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Starting…" }));
  expect(onStart).not.toHaveBeenCalled();
});

test.each([
  ["loading", "Loading Training", null],
  ["empty", "No cards match this setup", "Adjust filters"],
  ["error", "Training could not be loaded", "Try again"],
  ["first-use", "Create your first training", "Set up training"],
] as const)(
  "%s state is explicit and recoverable",
  (status, heading, action) => {
    const onRetry = vi.fn();
    render(
      <TrainingTodaySetup {...baseProps} status={status} onRetry={onRetry} />,
    );

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    if (action === "Try again") {
      fireEvent.click(screen.getByRole("button", { name: action }));
      expect(onRetry).toHaveBeenCalledOnce();
    } else if (action) {
      fireEvent.click(screen.getByRole("button", { name: action }));
      expect(
        screen.getByRole("heading", { name: "Build your session" }),
      ).toBeInTheDocument();
    }
  },
);
