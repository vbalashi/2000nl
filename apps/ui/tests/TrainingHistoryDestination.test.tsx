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
  const onReturnToTraining = vi.fn();
  fetchRecentTrainingHistory.mockResolvedValueOnce({
    items: [
      {
        entryId: "entry-1",
        headword: "bank",
        partOfSpeech: "zn.",
        reviewResult: "review_success",
        cardTypeId: "word-to-definition",
        reviewedAt: "2026-08-21T11:59:00.000Z",
      },
    ],
    hasMore: true,
  });

  const { rerender } = render(
    <TrainingHistoryDestination
      open={false}
      userId="user-1"
      interfaceLanguage="nl"
      onNavigate={onNavigate}
      onReturnToTraining={onReturnToTraining}
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
      onReturnToTraining={onReturnToTraining}
      utilityNav={utilityNav}
    />,
  );

  expect(await screen.findByRole("heading", { name: "Geschiedenis" })).toHaveFocus();
  expect(await screen.findByText("bank")).toBeInTheDocument();
  expect(screen.getByText("Goed")).toBeInTheDocument();
  expect(screen.getByText("Woord → betekenis")).toBeInTheDocument();
  expect(screen.getByText("De 50 meest recente beoordelingen worden getoond.")).toBeInTheDocument();
  expect(fetchRecentTrainingHistory).toHaveBeenCalledWith();

  await userEvent.click(screen.getByRole("button", { name: "Terug naar training" }));
  expect(onReturnToTraining).toHaveBeenCalledOnce();
  expect(onNavigate).not.toHaveBeenCalledWith("training");
});

test("distinguishes an empty day from a load failure and retries", async () => {
  fetchRecentTrainingHistory
    .mockRejectedValueOnce(new Error("training_history_failed"))
    .mockResolvedValueOnce({ items: [], hasMore: false });

  render(
    <TrainingHistoryDestination
      open
      userId="user-1"
      interfaceLanguage="en"
      onNavigate={vi.fn()}
      onReturnToTraining={vi.fn()}
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

test("never renders principal A history while principal B is loading", async () => {
  let resolveUserB!: (value: { items: never[]; hasMore: false }) => void;
  fetchRecentTrainingHistory
    .mockResolvedValueOnce({
      items: [
        {
          entryId: "entry-a",
          headword: "private-a",
          partOfSpeech: null,
          reviewResult: "review_success",
          cardTypeId: "word-to-definition",
          reviewedAt: "2026-08-21T11:59:00.000Z",
        },
      ],
      hasMore: false,
    })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUserB = resolve;
        }),
    );

  const props = {
    open: true,
    interfaceLanguage: "en" as const,
    onNavigate: vi.fn(),
    onReturnToTraining: vi.fn(),
    utilityNav,
  };
  const { rerender } = render(
    <TrainingHistoryDestination {...props} userId="principal-a" />,
  );
  expect(await screen.findByText("private-a")).toBeInTheDocument();

  rerender(<TrainingHistoryDestination {...props} userId="principal-b" />);

  expect(screen.queryByText("private-a")).not.toBeInTheDocument();
  expect(screen.getByText("Loading history…")).toBeInTheDocument();
  resolveUserB({ items: [], hasMore: false });
  expect(
    await screen.findByText("No training activity in the last 24 hours."),
  ).toBeInTheDocument();
});
