import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import {
  TrainingSessionAppHeader,
  TrainingSessionChrome,
} from "@/components/training/v2/TrainingSessionChrome";

test("composes the approved compact app header without changing its actions", () => {
  const onClose = vi.fn();
  const onHistory = vi.fn();

  render(
    <TrainingSessionAppHeader
      interfaceLanguage="en"
      onHistory={onHistory}
      onClose={onClose}
    />,
  );

  const header = screen.getByTestId("training-session-app-header");
  expect(header).toHaveAttribute("data-visual-spec", "training-v1.0");
  expect(header).toHaveClass("h-[58px]", "px-[18px]");
  expect(screen.getByLabelText("2000nl")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "History" }));
  fireEvent.click(screen.getByRole("button", { name: "Close session" }));
  expect(onHistory).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

test("omits History when the runtime does not provide an authoritative action", () => {
  render(
    <TrainingSessionAppHeader interfaceLanguage="en" onClose={vi.fn()} />,
  );

  expect(
    screen.queryByRole("button", { name: "History" }),
  ).not.toBeInTheDocument();
});

test.each([
  ["new", "word-to-definition", "Nieuw"],
  ["review", "word-to-definition", "Herhaling"],
  ["both", "word-to-definition", "Nieuw + herhaling"],
  ["both", "definition-to-word", "Begrip · Definitie → woord · Nieuw + herhaling"],
] as const)("projects the actual %s/%s session semantics", (cardFilter, mode, expectedLabel) => {
  render(
    <TrainingSessionChrome
      interfaceLanguage="nl"
      scenario="understanding"
      mode={mode}
      cardFilter={cardFilter}
      position={10}
      progress={null}
    />,
  );

  const chrome = screen.getByTestId("training-session-chrome");
  expect(chrome).toHaveAttribute("data-visual-spec", "training-v1.0");
  expect(chrome).toHaveClass("gap-[14px]");
  expect(screen.getByText("TRAINING")).toBeInTheDocument();
  expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  expect(screen.getByTestId("training-session-position")).toHaveTextContent("10");
  expect(screen.getByTestId("training-session-position")).not.toHaveTextContent("/");
  expect(screen.queryByTestId("training-session-progress-track")).not.toBeInTheDocument();
});

test("renders only the authoritative planned total and fraction", () => {
  render(
    <TrainingSessionChrome
      interfaceLanguage="nl"
      scenario="understanding"
      mode="word-to-definition"
      cardFilter="both"
      position={99}
      progress={{ position: 10, total: 23, fraction: 10 / 23 }}
    />,
  );

  expect(screen.getByTestId("training-session-position")).toHaveTextContent(
    "10 / 23",
  );
  const track = screen.getByTestId("training-session-progress-track");
  expect(track.firstElementChild).toHaveStyle({ width: `${(10 / 23) * 100}%` });
});
