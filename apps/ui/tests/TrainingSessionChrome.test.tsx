import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TrainingSessionChrome } from "@/components/training/v2/TrainingSessionChrome";

test("keeps the session name quiet without a separate Training eyebrow", () => {
  render(
    <TrainingSessionChrome
      interfaceLanguage="nl"
      scenario="understanding"
      mode="word-to-definition"
      cardFilter="both"
      presentation={{ kind: "ordinal", position: 1 }}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByText("TRAINING")).not.toBeInTheDocument();
  expect(screen.getByText("Nieuw + herhaling")).toBeInTheDocument();
});

test("omits History when the runtime does not provide an authoritative action", () => {
  render(
    <TrainingSessionChrome
      interfaceLanguage="en"
      scenario="understanding"
      mode="word-to-definition"
      cardFilter="both"
      presentation={{ kind: "ordinal", position: 1 }}
      onClose={vi.fn()}
    />,
  );

  expect(
    screen.queryByRole("button", { name: "History" }),
  ).not.toBeInTheDocument();
});

test("places History and Close with the session name and preserves their callbacks", () => {
  const onHistory = vi.fn();
  const onClose = vi.fn();
  render(
    <TrainingSessionChrome
      interfaceLanguage="en"
      scenario="understanding"
      mode="word-to-definition"
      cardFilter="both"
      presentation={{ kind: "ordinal", position: 1 }}
      onHistory={onHistory}
      onClose={onClose}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "History" }));
  fireEvent.click(screen.getByRole("button", { name: "Close session" }));
  expect(onHistory).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

test("blocks History and Close while an accepted action is still settling", () => {
  render(
    <TrainingSessionChrome
      interfaceLanguage="en"
      scenario="understanding"
      mode="word-to-definition"
      cardFilter="both"
      presentation={{ kind: "ordinal", position: 1 }}
      onHistory={vi.fn()}
      onClose={vi.fn()}
      disabled
    />,
  );

  expect(screen.getByRole("button", { name: "History" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Close session" })).toBeDisabled();
});

test.each([
  ["new", "word-to-definition", "Nieuw"],
  ["review", "word-to-definition", "Herhaling"],
  ["both", "word-to-definition", "Nieuw + herhaling"],
  [
    "both",
    "definition-to-word",
    "Begrip · Definitie → woord · Nieuw + herhaling",
  ],
] as const)(
  "projects the actual %s/%s session semantics",
  (cardFilter, mode, expectedLabel) => {
    render(
      <TrainingSessionChrome
        interfaceLanguage="nl"
        scenario="understanding"
        mode={mode}
        cardFilter={cardFilter}
        presentation={{ kind: "ordinal", position: 10 }}
        onClose={vi.fn()}
      />,
    );

    const chrome = screen.getByTestId("training-session-chrome");
    expect(chrome).toHaveAttribute("data-visual-spec", "training-height-b");
    expect(screen.queryByText("TRAINING")).not.toBeInTheDocument();
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    expect(screen.getByTestId("training-session-position")).toHaveTextContent(
      "10",
    );
    expect(
      screen.getByTestId("training-session-position"),
    ).not.toHaveTextContent("/");
    expect(
      screen.queryByTestId("training-session-progress-track"),
    ).not.toBeInTheDocument();
  },
);

test("renders only the authoritative planned total and fraction", () => {
  render(
    <TrainingSessionChrome
      interfaceLanguage="nl"
      scenario="understanding"
      mode="word-to-definition"
      cardFilter="both"
      onClose={vi.fn()}
      presentation={{
        kind: "planned",
        position: 10,
        total: 23,
        fraction: 10 / 23,
      }}
    />,
  );

  expect(screen.getByTestId("training-session-position")).toHaveTextContent(
    "10 / 23",
  );
  const track = screen.getByTestId("training-session-progress-track");
  expect(track.firstElementChild).toHaveStyle({ width: `${(10 / 23) * 100}%` });
});
