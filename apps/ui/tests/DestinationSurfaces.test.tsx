import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SettingsDestination } from "@/components/navigation/SettingsDestination";
import { StatisticsDestination } from "@/components/navigation/StatisticsDestination";

const utilityNav = {
  themePreference: "system" as const,
  userEmail: "learner@example.com",
  onCycleTheme: vi.fn(),
  onOpenSearch: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenHelp: vi.fn(),
  onOpenHistory: vi.fn(),
  onOpenStatistics: vi.fn(),
  onSignOut: vi.fn(),
};

test("App Settings exposes only application preferences", () => {
  const onThemeChange = vi.fn();
  const onInterfaceLanguageChange = vi.fn();
  const onTranslationLanguageChange = vi.fn();
  const onOpenSearch = vi.fn();
  const onOpenSettings = vi.fn();
  const onOpenHelp = vi.fn();
  const onOpenHistory = vi.fn();

  render(
    <SettingsDestination
      open
      interfaceLanguage="en"
      themePreference="system"
      translationLanguage="ru"
      onThemeChange={onThemeChange}
      onInterfaceLanguageChange={onInterfaceLanguageChange}
      onTranslationLanguageChange={onTranslationLanguageChange}
      onNavigate={vi.fn()}
      onOpenSearch={onOpenSearch}
      onOpenSettings={onOpenSettings}
      onOpenHelp={onOpenHelp}
      onOpenHistory={onOpenHistory}
      userEmail="learner@example.com"
      onSignOut={vi.fn()}
    />,
  );

  expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  expect(screen.getByText("Interface language")).toBeInTheDocument();
  expect(screen.getByText("Translation language")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Keyboard shortcuts" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Open or close recent words")).toBeInTheDocument();
  expect(screen.getByText("R")).toBeInTheDocument();
  expect(screen.queryByText(/audio quality/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/subscription/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/training setup/i)).not.toBeInTheDocument();
  const primary = screen.getByRole("navigation", { name: "Primary" });
  expect(
    within(primary).queryByRole("button", { name: "Settings" }),
  ).not.toBeInTheDocument();
  for (const destination of ["Training", "Library", "Statistics"]) {
    expect(
      within(primary).getByRole("button", { name: destination }),
    ).not.toHaveAttribute("aria-current");
  }
  expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(onOpenSearch).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "History" }));
  expect(onOpenHistory).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole("button", { name: "Dark" }));
  expect(onThemeChange).toHaveBeenCalledWith("dark");
  fireEvent.change(screen.getByLabelText("Interface language"), {
    target: { value: "ru" },
  });
  expect(onInterfaceLanguageChange).toHaveBeenCalledWith("ru");
});

test("Statistics uses real available counters and returns to Training", () => {
  const onNavigate = vi.fn();
  render(
    <StatisticsDestination
      open
      interfaceLanguage="en"
      stats={{
        newWordsToday: 4,
        newCardsToday: 5,
        dailyNewLimit: 10,
        reviewWordsDone: 6,
        reviewCardsDone: 7,
        reviewWordsDue: 8,
        reviewCardsDue: 9,
        totalWordsLearned: 120,
        totalWordsInList: 2000,
      }}
      onNavigate={onNavigate}
      utilityNav={utilityNav}
    />,
  );

  expect(
    screen.getByRole("heading", { name: "Statistics" }),
  ).toBeInTheDocument();
  expect(screen.getByText("4 / 10")).toBeInTheDocument();
  expect(screen.getByText("7")).toBeInTheDocument();
  expect(screen.getByText("9")).toBeInTheDocument();
  expect(screen.getByText("120 / 2000")).toBeInTheDocument();
  expect(screen.queryByText(/retention/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/streak/i)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Statistics" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onNavigate).toHaveBeenCalledWith("training");
});
