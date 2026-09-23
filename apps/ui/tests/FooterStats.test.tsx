import React from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { DetailedStats } from "@/lib/types";
import { FooterStats } from "@/components/training/FooterStats";

const stats: DetailedStats = {
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
};

test("session footer does not present unknown progress as zero", () => {
  render(
    <FooterStats
      stats={stats}
      statsStatus="pending"
      cardFilter="both"
      onCardFilterChange={vi.fn()}
      language="nl"
      onLanguageChange={vi.fn()}
      compact
      interfaceLanguage="en"
    />,
  );

  const progress = screen.getByTestId("training-session-footer-progress");
  expect(progress).toHaveTextContent("—");
  expect(progress).not.toHaveTextContent("5");
  expect(progress).not.toHaveTextContent("7/16");
  expect(progress).not.toHaveTextContent("120/2000");
  expect(screen.getByLabelText("New: loading")).toBeInTheDocument();
});
