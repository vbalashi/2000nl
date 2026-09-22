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
    learningStartedToday: 4,
    graduatedNewWordsToday: 0,
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
  expect(screen.getByText("12 cards completed this study day")).toBeInTheDocument();
  expect(
    screen.getByText("9 reviews due · 4 new this study day"),
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
  fireEvent.change(screen.getByRole("slider", { name: "Review ↔ new rhythm" }), {
    target: { value: "0" },
  });
  expect(screen.getByRole("slider", { name: "Review ↔ new rhythm" })).toHaveAttribute(
    "aria-valuetext",
    "Reviews only",
  );
  expect(onStart).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Back to Today" }));
  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  expect(screen.getByRole("button", { name: "Meaning" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("slider", { name: "Review ↔ new rhythm" })).toHaveValue("4");

  fireEvent.click(screen.getByRole("button", { name: "Reverse" }));
  expect(screen.getByRole("button", { name: "Reverse" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.change(screen.getByRole("slider", { name: "Review ↔ new rhythm" }), {
    target: { value: "3" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));

  expect(onStart).toHaveBeenCalledOnce();
  expect(onStart).toHaveBeenCalledWith({
    ...initialDraft,
    sessionSize: 10,
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

test("session size is an explicit per-session choice", () => {
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} onStart={onStart} />);

  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  fireEvent.change(screen.getByRole("slider", { name: "Session size" }), {
    target: { value: "0" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));

  expect(onStart).toHaveBeenCalledWith(
    expect.objectContaining({ sessionSize: 5 }),
  );
});

test("all due means reviews only, and moving the mix slider restores a finite size", () => {
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} onStart={onStart} />);

  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  fireEvent.click(screen.getByRole("button", { name: "All due today" }));
  expect(screen.getByRole("slider", { name: "Review ↔ new rhythm" })).toHaveValue("0");
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenCalledWith(
    expect.objectContaining({ cardFilter: "review", sessionSize: "all-due-today" }),
  );

  fireEvent.change(screen.getByRole("slider", { name: "Review ↔ new rhythm" }), {
    target: { value: "4" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenLastCalledWith(
    expect.objectContaining({ cardFilter: "both", sessionSize: 10 }),
  );
});

test("mix slider endpoints and middle stops retain the chosen rhythm", () => {
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} onStart={onStart} />);
  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  const slider = screen.getByRole("slider", { name: "Review ↔ new rhythm" });

  fireEvent.change(slider, { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenLastCalledWith(
    expect.objectContaining({ cardFilter: "new", newReviewRatio: 2 }),
  );

  fireEvent.change(slider, { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenLastCalledWith(
    expect.objectContaining({ cardFilter: "both", newReviewRatio: 5 }),
  );

  fireEvent.change(slider, { target: { value: "0" } });
  fireEvent.change(slider, { target: { value: "1" } });
  expect(slider).toHaveAttribute("aria-valuetext", "1 new : 5 reviews");
});

test("an existing 1:4 preference remains representable by the slider", () => {
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} initialDraft={{ ...initialDraft, newReviewRatio: 4 }} onStart={onStart} />);
  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  expect(screen.getByRole("slider", { name: "Review ↔ new rhythm" })).toHaveValue("2");
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ newReviewRatio: 4 }));
});

test("a saved preset can be reopened and modified on this device", () => {
  render(
    <TrainingTodaySetup
      {...baseProps}
      userId="preset-test-user"
      trainingLanguageCode="nl"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  fireEvent.change(screen.getByRole("slider", { name: "Session size" }), {
    target: { value: "4" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save preset" }));
  fireEvent.click(screen.getByRole("button", { name: "Back to Today" }));
  expect(screen.getByText("NT2 2000 · Words · 1 new : 2 reviews · 30 exercises")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByRole("slider", { name: "Session size" })).toHaveValue("4");
  fireEvent.change(screen.getByRole("slider", { name: "Session size" }), {
    target: { value: "5" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update preset" }));
  expect(screen.getByText("Saved on this device")).toBeInTheDocument();
  window.localStorage.clear();
});

test.each([
  ["loading", "Loading card", null],
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
