import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SettingsDestination } from "@/components/navigation/SettingsDestination";
import { StatisticsDestination } from "@/components/navigation/StatisticsDestination";

const utilityNav = {
  themePreference: "system" as const,
  onCycleTheme: vi.fn(),
  onOpenSettings: vi.fn(),
};

test("App Settings exposes application preferences and the signed-in account", () => {
  const onThemeChange = vi.fn();
  const onInterfaceLanguageChange = vi.fn();
  const onTranslationLanguageChange = vi.fn();
  const onSignOut = vi.fn();

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
      userEmail="learner@example.com"
      onSignOut={onSignOut}
    />,
  );

  expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  expect(screen.getByText("Interface language")).toBeInTheDocument();
  expect(screen.getByText("Translation language")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Keyboard shortcuts" }),
  ).toBeInTheDocument();
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
  expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Help" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "History" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
  expect(screen.getByText("learner@example.com")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(onSignOut).toHaveBeenCalledOnce();

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
  expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Help" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "History" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Statistics" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onNavigate).toHaveBeenCalledWith("training");
});
