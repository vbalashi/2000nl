import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TrainingBootstrapShell } from "@/components/training/pilot/TrainingBootstrapShell";
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
test.each(["en", "nl", "ru"] as const)("approved %s startup has logo and status without navigation or framed state", language => {
  render(<TrainingBootstrapShell interfaceLanguage={language} />);
  expect(screen.getByLabelText("2000nl")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  expect(screen.queryByTestId("app-header")).not.toBeInTheDocument();
  expect(screen.queryByTestId("training-loading-indicator")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveAccessibleName();
  expect(document.querySelectorAll(".startup-dots i")).toHaveLength(3);
  expect(screen.getByRole("heading")).toHaveClass("sr-only");
});
test("approved bootstrap keeps retry available after failure", () => {
  const retry = vi.fn();
  render(<TrainingBootstrapShell interfaceLanguage="en" status="error" onRetry={retry} />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});
