import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SettingsDestination } from "@/components/navigation/SettingsDestination";
import { StatisticsDestination } from "@/components/navigation/StatisticsDestination";

vi.mock("@/components/navigation/statistics/AccountStatistics", () => ({
  AccountStatistics: ({ userId, languageCode, open, interfaceLanguage, onPractiseMaterial, onHistory }: {
    userId: string; languageCode: string; open: boolean; interfaceLanguage: string;
    onPractiseMaterial: (language: string, material: { kind: "all" }) => void; onHistory?: () => void;
  }) => <section>
    <p>{`${userId}:${languageCode}:${open}:${interfaceLanguage}`}</p>
    <button onClick={() => onPractiseMaterial(languageCode, { kind: "all" })}>Practise</button>
    {onHistory ? <button onClick={onHistory}>Recent activity</button> : null}
  </section>,
}));

test("App Settings exposes application preferences and the signed-in account", async () => {
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
      userEmail="learner@example.com"
      onSignOut={onSignOut}
      onExit={vi.fn()}
    />,
  );

  expect(screen.getByRole("heading", { name: "Settings", level: 1 })).toBeInTheDocument();
  const sections = within(screen.getByRole("navigation", { name: "Settings sections" }));
  fireEvent.click(sections.getByRole("button", { name: "Shortcuts" }));
  expect(screen.getByRole("heading", { name: "Training shortcuts" })).toBeInTheDocument();
  expect(screen.queryByText(/audio quality/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/training setup/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Help" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "History" })).not.toBeInTheDocument();
  fireEvent.click(sections.getByRole("button", { name: "Appearance" }));
  fireEvent.click(screen.getByRole("button", { name: "Dark" }));
  expect(onThemeChange).toHaveBeenCalledWith("dark");
  fireEvent.click(sections.getByRole("button", { name: "Languages" }));
  expect(screen.getByText("Interface language")).toBeInTheDocument();
  expect(screen.getByText("Translation language")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Interface language"));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Русский" }));
  expect(onInterfaceLanguageChange).toHaveBeenCalledWith("ru");
  fireEvent.click(sections.getByRole("button", { name: "Account" }));
  expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
  expect(screen.getByText("learner@example.com")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(onSignOut).toHaveBeenCalledOnce();
});

test("Statistics always uses the account presentation and forwards its actions", () => {
  const onHistory = vi.fn();
  const onPractiseMaterial = vi.fn();
  render(
    <StatisticsDestination
      open
      userId="account"
      languageCode="nl"
      interfaceLanguage="en"
      stats={{
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
      }}
      onStartTraining={vi.fn()}
      onPractiseMaterial={onPractiseMaterial}
      onHistory={onHistory}
    />,
  );
  expect(screen.getByText("account:nl:true:en")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Practise" }));
  expect(onPractiseMaterial).toHaveBeenCalledWith("nl", { kind: "all" });
  fireEvent.click(screen.getByRole("button", { name: "Recent activity" }));
  expect(onHistory).toHaveBeenCalledOnce();
});
