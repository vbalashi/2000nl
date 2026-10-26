import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AppReleaseContext } from "@/components/releases/AppReleaseContext";
import type { AppReleaseState } from "@/components/releases/useAppRelease";
import {
  ReleaseBanner,
  ReleaseUpdatesSection,
} from "@/components/releases/ReleaseUpdates";
import { AppUtilityNav } from "@/components/navigation/AppUtilityNav";
import { SettingsDestination } from "@/components/navigation/SettingsDestination";
const installed = {
  version: "1.0",
  commit: "a".repeat(40),
  commitShort: "aaaaaaaa",
  buildTimestamp: "2026-10-16T08:00:00Z",
  formattedBuildTimestamp: "",
  display: "v1.0",
};
function state(patch: Partial<AppReleaseState> = {}): AppReleaseState {
  return {
    installed,
    release: {
      schemaVersion: 1,
      build: { ...installed, version: "2.0", commit: "b".repeat(40) },
      announcement: {
        id: "news",
        publishedAt: "2026-10-17T08:00:00Z",
        locale: "en",
        title: "Two languages",
        summary: "Read complete cards in two languages.",
        detailsUrl: "https://example.org/blog",
      },
    },
    status: "ready",
    updateAvailable: true,
    unread: true,
    attention: true,
    banner: true,
    unsafe: false,
    check: vi.fn(),
    update: vi.fn(),
    dismiss: vi.fn(),
    markRead: vi.fn(),
    development: false,
    ...patch,
  };
}
afterEach(cleanup);
test("banner renders short news, separate external link and explicit update/later actions", () => {
  const value = state();
  render(
    <AppReleaseContext.Provider value={value}>
      <ReleaseBanner language="en" />
    </AppReleaseContext.Provider>,
  );
  const link = screen.getByRole("link", { name: /Read more/ });
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  fireEvent.click(screen.getByRole("button", { name: "Later" }));
  expect(value.dismiss).toHaveBeenCalledOnce();
  expect(value.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Update app" }));
  expect(value.update).toHaveBeenCalledOnce();
});
test("header keeps exactly two controls and point after banner is dismissed", () => {
  render(
    <AppReleaseContext.Provider value={state({ banner: false })}>
      <AppUtilityNav
        interfaceLanguage="en"
        themePreference="system"
        onCycleTheme={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    </AppReleaseContext.Provider>,
  );
  expect(screen.getAllByRole("button")).toHaveLength(2);
  expect(screen.getByTestId("release-dot")).toBeTruthy();
});
test("Updates navigation marks news read, keeps update action and active page distinct", () => {
  const value = state();
  render(
    <AppReleaseContext.Provider value={value}>
      <SettingsDestination
        open
        interfaceLanguage="en"
        themePreference="system"
        translationLanguage="ru"
        onThemeChange={vi.fn()}
        onInterfaceLanguageChange={vi.fn()}
        onTranslationLanguageChange={vi.fn()}
        userEmail="test@example.test"
        onSignOut={vi.fn()}
        onExit={vi.fn()}
      />
    </AppReleaseContext.Provider>,
  );
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Settings sections" }),
    ).getByRole("button", { name: "Updates" }),
  );
  expect(value.markRead).toHaveBeenCalledOnce();
  expect(screen.getByRole("heading", { name: "Updates" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Update app" })).toBeEnabled();
});
test("busy session disables update and explains why; absent news has no empty article", () => {
  const value = state({
    unsafe: true,
    release: { schemaVersion: 1, build: installed, announcement: null },
  });
  render(
    <AppReleaseContext.Provider value={value}>
      <ReleaseUpdatesSection language="en" />
    </AppReleaseContext.Provider>,
  );
  expect(screen.getByRole("button", { name: "Update app" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Finish your training");
  expect(screen.queryByRole("article")).toBeNull();
});
