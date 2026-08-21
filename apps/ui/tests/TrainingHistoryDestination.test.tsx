import React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const fetchRecentTrainingHistory = vi.fn();

vi.mock("@/lib/training/trainingHistoryService", () => ({
  fetchRecentTrainingHistory,
}));

const { TrainingHistoryDestination } = await import(
  "@/components/navigation/TrainingHistoryDestination"
);

const utilityNav = {
  themePreference: "system" as const,
  onCycleTheme: vi.fn(),
  onOpenSettings: vi.fn(),
};

beforeEach(() => {
  fetchRecentTrainingHistory.mockReset();
});

test("loads recent authoritative activity only when opened and returns to Training", async () => {
  const onNavigate = vi.fn();
  fetchRecentTrainingHistory.mockResolvedValueOnce([
    {
      entryId: "entry-1",
      headword: "bank",
      partOfSpeech: "zn.",
      eventType: "review_success",
      mode: "word-to-definition",
      createdAt: "2026-08-21T11:59:00.000Z",
    },
  ]);

  const { rerender } = render(
    <TrainingHistoryDestination
      open={false}
      userId="user-1"
      interfaceLanguage="nl"
      onNavigate={onNavigate}
      utilityNav={utilityNav}
    />,
  );
  expect(fetchRecentTrainingHistory).not.toHaveBeenCalled();

  rerender(
    <TrainingHistoryDestination
      open
      userId="user-1"
      interfaceLanguage="nl"
      onNavigate={onNavigate}
      utilityNav={utilityNav}
    />,
  );

  expect(await screen.findByRole("heading", { name: "Geschiedenis" })).toHaveFocus();
  expect(await screen.findByText("bank")).toBeInTheDocument();
  expect(screen.getByText("Goed")).toBeInTheDocument();
  expect(screen.getByText("Woord → betekenis")).toBeInTheDocument();
  expect(fetchRecentTrainingHistory).toHaveBeenCalledWith("user-1");

  await userEvent.click(screen.getByRole("button", { name: "Terug naar training" }));
  expect(onNavigate).toHaveBeenCalledWith("training");
});

test("distinguishes an empty day from a load failure and retries", async () => {
  fetchRecentTrainingHistory
    .mockRejectedValueOnce(new Error("training_history_failed"))
    .mockResolvedValueOnce([]);

  render(
    <TrainingHistoryDestination
      open
      userId="user-1"
      interfaceLanguage="en"
      onNavigate={vi.fn()}
      utilityNav={utilityNav}
    />,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "History could not be loaded",
  );
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(fetchRecentTrainingHistory).toHaveBeenCalledTimes(2));
  expect(
    await screen.findByText("No training activity in the last 24 hours."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
