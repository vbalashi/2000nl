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

test("renders the approved session identity, count and progress as one reusable owner", () => {
  render(
    <TrainingSessionChrome
      interfaceLanguage="en"
      scenario="understanding"
      mode="word-to-definition"
      position={10}
      total={23}
    />,
  );

  const chrome = screen.getByTestId("training-session-chrome");
  expect(chrome).toHaveAttribute("data-visual-spec", "training-v1.0");
  expect(chrome).toHaveClass("gap-[14px]");
  expect(screen.getByText("TRAINING")).toBeInTheDocument();
  expect(screen.getByText("New + review")).toBeInTheDocument();
  expect(screen.getByTestId("training-session-position")).toHaveTextContent("10 / 23");
  expect(screen.getByTestId("training-session-progress-track")).toHaveClass("h-1");
});
