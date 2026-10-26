import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReadingPreferencesProvider } from "@/components/reading/ReadingPreferencesProvider";
import { ReadingSettingsSection } from "@/components/reading/ReadingSettingsSection";
import type { ReadingPreferencesRepository } from "@/lib/reading/readingPreferencesRepository";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
});

function settings(repository: ReadingPreferencesRepository, userId = "reader") {
  return <ReadingPreferencesProvider userId={userId} repository={repository}>
    <ReadingSettingsSection language="en" />
  </ReadingPreferencesProvider>;
}

test("phone text profile follows the device and ignores the retired local override", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
  window.localStorage.setItem("2000nl.reading-device.v1", "desktop");
  const repository: ReadingPreferencesRepository = {
    load: vi.fn().mockResolvedValue({ phone: "normal", desktop: "large" }),
    save: vi.fn().mockResolvedValue(undefined),
  };
  render(settings(repository));
  const larger = await screen.findByRole("button", { name: "Larger" });
  await waitFor(() => expect(larger).toBeEnabled());
  expect(larger).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(larger);
  await waitFor(() => expect(repository.save).toHaveBeenCalledWith("reader", "phone", "large"));
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});

test("switching accounts drops a previous account's pending load", async () => {
  let finishFirst!: (value: { phone: "largest"; desktop: "largest" }) => void;
  const firstLoad = new Promise<{ phone: "largest"; desktop: "largest" }>((resolve) => { finishFirst = resolve; });
  const repository: ReadingPreferencesRepository = {
    load: vi.fn().mockReturnValueOnce(firstLoad).mockResolvedValue({ phone: "normal", desktop: "large" }),
    save: vi.fn(),
  };
  const view = render(settings(repository, "first"));
  view.rerender(settings(repository, "second"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Extra large" })).toBeEnabled());
  await act(async () => finishFirst({ phone: "largest", desktop: "largest" }));
  expect(screen.getByRole("button", { name: "Larger" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Extra large" })).toHaveAttribute("aria-pressed", "false");
});
