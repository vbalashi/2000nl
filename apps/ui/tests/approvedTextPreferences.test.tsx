import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReadingPreferencesProvider } from "@/components/reading/ReadingPreferencesProvider";
import { ReadingSettingsSection } from "@/components/reading/ReadingSettingsSection";
import type { ReadingPreferencesRepository } from "@/lib/reading/readingPreferencesRepository";
import { accountTextSizeStyles } from "@/lib/reading/textScale";

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => { vi.unstubAllEnvs(); });
const repository = (): ReadingPreferencesRepository => ({
  load: vi.fn().mockResolvedValue({ phone: "normal", desktop: "large" }),
  save: vi.fn().mockResolvedValue(undefined),
});

test("four-step account size changes reading, display and UI tokens without resetting the other device", async () => {
  const repo = repository();
  const view = render(
    <ReadingPreferencesProvider userId="account" repository={repo}>
      <ReadingSettingsSection language="en" />
    </ReadingPreferencesProvider>,
  );
  const extra = await screen.findByRole("button", { name: "Extra large" });
  await waitFor(() => expect(extra).toBeEnabled());
  expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(3);
  fireEvent.click(extra);
  await waitFor(() => expect(screen.getByRole("button", {name: "Extra large"})).toBeEnabled());
  expect(repo.save).toHaveBeenCalledWith("account", "desktop", "extra");
  const root = view.container.querySelector(
    '[data-reading-device="desktop"]',
  ) as HTMLElement;
  expect(root.dataset.readingSize).toBe("extra");
  expect(root.dataset.textSize).toBe("extra");
  const styles = accountTextSizeStyles("extra");
  for (const role of ["body", "headword"]) {
    expect(root.style.getPropertyValue(`--account-practice-text-${role}`)).toBe(
      styles[`--practice-text-${role}`],
    );
  }
  expect(
    root.style.getPropertyValue("--account-practice-reading-definition"),
  ).toBe("2.5rem");
  expect(repo.save).not.toHaveBeenCalledWith("account", "phone", expect.anything());
  expect(repo.save).toHaveBeenCalledTimes(1);
});

test("failed approved save stays visible and retries the same selected size", async () => {
  const repo = repository();
  vi.mocked(repo.save).mockRejectedValueOnce(new Error("offline"));
  render(
    <ReadingPreferencesProvider userId="account" repository={repo}>
      <ReadingSettingsSection language="en" />
    </ReadingPreferencesProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Extra large" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Extra large" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Not saved");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByRole("button", {name: "Extra large"})).toBeEnabled());
  expect(repo.save).toHaveBeenNthCalledWith(2, "account", "desktop", "extra");
});
