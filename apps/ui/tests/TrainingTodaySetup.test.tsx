import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import {
  TrainingTodaySetup,
  type TrainingSetupDraft,
} from "@/components/training/pilot/TrainingTodaySetup";
import { presetStorageKey } from "@/components/training/pilot/trainingSetupPresets";

const initialDraft: TrainingSetupDraft = {
  scenarioId: "understanding",
  modes: ["word-to-definition"],
  cardFilter: "both",
  listValue: "curated:nt2",
  newReviewRatio: 2,
  dateWindow: "all",
  sourceValue: "all",
};
const dictionaryA = "00000000-0000-4000-8000-0000000000a1";
const dictionaryB = "00000000-0000-4000-8000-0000000000b2";
const dictionaryLost = "00000000-0000-4000-8000-0000000000c3";

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

test("setup exposes working Dutch POS and noun article filters while other languages stay unavailable", () => {
  const onTrainingLanguageChange = vi.fn();
  render(<TrainingTodaySetup {...baseProps} trainingLanguageCode="nl" trainingLanguageOptions={[{ value: "nl", label: "Nederlands" }, { value: "en", label: "English" }]} onTrainingLanguageChange={onTrainingLanguageChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  expect(screen.getByLabelText("Training language")).toHaveValue("nl");
  expect(screen.getByText("Change material")).toBeInTheDocument();
  expect(screen.queryByText("TRAINING · SETUP")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Any" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Verb" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "de" })).toBeEnabled();
  const disclosure = screen.getByText("Show 8 more parts of speech");
  fireEvent.click(disclosure);
  expect(disclosure.closest("details")).toHaveAttribute("open");
  for (const name of ["Preposition", "Pronoun", "Conjunction", "Numeral", "Article", "Interjection", "Abbreviation"]) {
    expect(screen.getByRole("button", { name: new RegExp(`^${name}$`) })).toBeEnabled();
  }
  expect(screen.getByRole("button", { name: "Fixed expression" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Verb" }));
  expect(screen.getByRole("button", { name: "Verb" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "de" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Training language"), { target: { value: "en" } });
  expect(onTrainingLanguageChange).toHaveBeenCalledWith("en");
  expect(screen.getByRole("button", { name: "Start training" })).toBeDisabled();
});

test("lexical choices are sent with the selected ordinary training draft", () => {
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} onStart={onStart} />);
  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  fireEvent.click(screen.getByRole("button", { name: "Verb" }));
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
    partOfSpeech: ["ww"],
    nounArticles: [],
  }));
});

test("idiom family is selectable as a separate finite session and reaches the start callback", () => {
  const onStart = vi.fn();
  render(
    <TrainingTodaySetup
      {...baseProps}
      onStart={onStart}
      scenarios={[
        ...baseProps.scenarios,
        { value: "idiom", label: "Idioms", modes: ["word-to-definition" as const, "definition-to-word" as const] },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  fireEvent.click(screen.getByRole("button", { name: "Idioms" }));
  expect(screen.getByRole("button", { name: "Idioms" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
    family: "idiom",
    scenarioId: "idiom",
    sessionSize: 10,
  }));
});

test("language hydration replaces material without carrying a Dutch preset into English", () => {
  const onStart = vi.fn();
  const props = { ...baseProps, userId: "language-switch-test", trainingLanguageCode: "nl", onStart, onTrainingLanguageChange: vi.fn(), trainingLanguageOptions: [{ value: "nl", label: "Nederlands" }, { value: "en", label: "English" }] };
  const { rerender } = render(<TrainingTodaySetup {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  fireEvent.change(screen.getByLabelText("Training language"), { target: { value: "en" } });
  rerender(<TrainingTodaySetup {...props} trainingLanguageCode="en" trainingLanguageLoading />);
  expect(screen.getByRole("button", { name: "Save preset" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: /^de$/ })).not.toBeInTheDocument();
  expect(screen.getByText("Lexical filters for this language are not connected yet.")).toBeInTheDocument();
  rerender(<TrainingTodaySetup {...props} trainingLanguageCode="en" initialDraft={{ ...initialDraft, listValue: "user:english" }} lists={[{ value: "user:english", label: "English collection" }]} />);
  expect(screen.getByLabelText("Collection")).toHaveValue("user:english");
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ listValue: "user:english" }));
});

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

test("pending card and stats keep Today and setup usable while actions stay guarded", () => {
  const onContinue = vi.fn();
  const onStart = vi.fn();
  render(
    <TrainingTodaySetup
      {...baseProps}
      statsStatus="pending"
      cardPreparationStatus="pending"
      startBlocked
      continueDisabled
      onContinue={onContinue}
      onStart={onStart}
    />,
  );

  expect(screen.getByRole("heading", { name: "Good morning" })).toBeInTheDocument();
  expect(screen.getAllByText("Loading progress…")).toHaveLength(2);
  expect(screen.getByText("Preparing your next card…")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continue session" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  expect(screen.getByLabelText("Review ↔ new rhythm")).toBeEnabled();
  expect(screen.getByRole("button", { name: "Start training" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onContinue).not.toHaveBeenCalled();
  expect(onStart).not.toHaveBeenCalled();
});

test("stats error is explicit and can be retried without replacing Today", () => {
  const onRetryStats = vi.fn();
  render(
    <TrainingTodaySetup
      {...baseProps}
      statsStatus="error"
      onRetryStats={onRetryStats}
    />,
  );
  expect(screen.getByRole("heading", { name: "Good morning" })).toBeInTheDocument();
  expect(screen.getAllByText("Progress could not be loaded.")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Retry progress" }));
  expect(onRetryStats).toHaveBeenCalledOnce();
});

test("resume checking and failure stay distinct from card preparation and can be retried", () => {
  const onRetryResume = vi.fn();
  const props = {
    ...baseProps,
    sessionResumeStatus: "pending" as const,
    cardPreparationStatus: "idle" as const,
    startBlocked: true,
    continueDisabled: true,
    onRetryResume,
  };
  const { rerender } = render(<TrainingTodaySetup {...props} />);

  expect(screen.getByText("Checking your saved session…")).toBeInTheDocument();
  expect(screen.queryByText("Preparing your next card…")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continue session" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  expect(screen.getByRole("slider", { name: "Review ↔ new rhythm" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Start training" })).toBeDisabled();

  rerender(
    <TrainingTodaySetup
      {...props}
      sessionResumeStatus="error"
    />,
  );
  expect(screen.getByText("Your saved session could not be checked.")).toHaveAttribute(
    "role",
    "alert",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry session check" }));
  expect(onRetryResume).toHaveBeenCalledOnce();
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
  fireEvent.change(screen.getByRole("slider", { name: "Session size" }), { target: { value: "6" } });
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
  fireEvent.click(screen.getByRole("button", { name: "Verb" }));
  fireEvent.click(screen.getByRole("button", { name: "Noun" }));
  fireEvent.click(screen.getByRole("button", { name: "de" }));
  fireEvent.click(screen.getByRole("button", { name: "Save preset" }));
  fireEvent.click(screen.getByRole("button", { name: "Back to Today" }));
  expect(screen.getByText("NT2 2000 · Words · 1 new : 2 reviews · 30 exercises")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByRole("slider", { name: "Session size" })).toHaveValue("4");
  expect(screen.getByRole("button", { name: "Verb" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Noun" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "de" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.change(screen.getByRole("slider", { name: "Session size" }), {
    target: { value: "5" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update preset" }));
  expect(screen.getByText("Saved on this device")).toBeInTheDocument();
  window.localStorage.clear();
});

test("a preset with a missing collection stays editable and cannot start another collection", () => {
  const userId = "missing-material-test-user";
  const key = presetStorageKey(userId, "nl");
  window.localStorage.setItem(key, JSON.stringify([{
    id: "missing-material",
    name: "Old collection · Words",
    draft: { ...initialDraft, listValue: "user:missing", sessionSize: 10 },
  }]));
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} userId={userId} trainingLanguageCode="nl" onStart={onStart} />);

  expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  expect(screen.getByText("Selected material is unavailable. Choose another before starting.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText("Collection")).toHaveValue("user:missing");
  expect(screen.getByRole("button", { name: "Selected material is unavailable. Choose another before starting." })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Update preset" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Collection"), { target: { value: "curated:nt2" } });
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ listValue: "curated:nt2" }));
  window.localStorage.removeItem(key);
});

test("dictionary material modes launch only the chosen source and persist in a preset", () => {
  const userId = "dictionary-mode-user";
  const onStart = vi.fn();
  render(<TrainingTodaySetup
    {...baseProps}
    userId={userId}
    trainingLanguageCode="nl"
    dictionaries={[{ value: dictionaryA, label: "Core Dutch" }, { value: dictionaryB, label: "My Dutch" }]}
    onStart={onStart}
  />);

  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  fireEvent.click(screen.getByRole("button", { name: "All accessible dictionaries" }));
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenLastCalledWith(expect.objectContaining({ materialMode: "all-dictionaries" }));

  fireEvent.click(screen.getByRole("button", { name: "Selected dictionaries" }));
  expect(screen.getByRole("button", { name: "Selected material is unavailable. Choose another before starting." })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("My Dutch"));
  fireEvent.click(screen.getByRole("button", { name: "Save preset" }));
  fireEvent.click(screen.getByRole("button", { name: "Back to Today" }));
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(onStart).toHaveBeenLastCalledWith(expect.objectContaining({
    materialMode: "selected-dictionaries",
    dictionaryIds: [dictionaryB],
  }));
  window.localStorage.removeItem(presetStorageKey(userId, "nl"));
});

test("a failed start returns to Today and explains material loss", async () => {
  const onStart = vi.fn().mockResolvedValue(false);
  const { rerender } = render(<TrainingTodaySetup {...baseProps} onStart={onStart} />);
  fireEvent.click(screen.getByRole("button", { name: "Adjust training" }));
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(await screen.findByRole("heading", { name: "Good morning" })).toBeInTheDocument();
  rerender(<TrainingTodaySetup {...baseProps} onStart={onStart} startError="training_material_unavailable" cardPreparationStatus="error" />);
  expect(screen.getByRole("alert")).toHaveTextContent("Selected material is unavailable. Choose another before starting.");
});

test("partially unavailable dictionary presets retain their references and disclose the reduction", () => {
  const userId = "partial-dictionary-user";
  const key = presetStorageKey(userId, "nl");
  window.localStorage.setItem(key, JSON.stringify([{
    id: "partial",
    name: "Two dictionaries · Words",
    draft: {
      ...initialDraft,
      materialMode: "selected-dictionaries",
      dictionaryIds: [dictionaryA, dictionaryLost],
      sessionSize: 10,
    },
  }]));
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} userId={userId} trainingLanguageCode="nl"
    dictionaries={[{ value: dictionaryA, label: "Core Dutch" }]} onStart={onStart} />);
  expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText("Core Dutch")).toBeChecked();
  expect(screen.getByText("Some selected dictionaries are unavailable; this session will use only those you can access.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ dictionaryIds: [dictionaryA, dictionaryLost] }));
  window.localStorage.removeItem(key);
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

test("empty candidate state can recover to its selected lexical filter setup", () => {
  render(
    <TrainingTodaySetup
      {...baseProps}
      status="empty"
      initialDraft={{ ...initialDraft, partOfSpeech: ["ww"], nounArticles: [] }}
    />,
  );

  expect(
    screen.getByRole("heading", { name: "No cards match this setup" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Adjust filters" }));
  expect(screen.getByRole("button", { name: "Verb" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
