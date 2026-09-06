import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ReadingPreferencesProvider } from "@/components/reading/ReadingPreferencesProvider";
import { ReadingSettingsSection } from "@/components/reading/ReadingSettingsSection";
import type { ReadingPreferencesRepository } from "@/lib/reading/readingPreferencesRepository";

const originalWidth = window.innerWidth;
beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
});

function settings(repository: ReadingPreferencesRepository, userId = "reader") {
  return <ReadingPreferencesProvider userId={userId} repository={repository}>
    <ReadingSettingsSection language="en" />
  </ReadingPreferencesProvider>;
}

test("Settings saves phone size independently and never selects phone because a desktop window narrows", async () => {
  const values = { phone: "normal", desktop: "large" } as const;
  const repository: ReadingPreferencesRepository = {
    load: vi.fn().mockResolvedValue(values),
    save: vi.fn().mockResolvedValue(undefined),
  };
  render(<ReadingPreferencesProvider userId="reader" repository={repository}>
    <ReadingSettingsSection language="en" />
  </ReadingPreferencesProvider>);
  const phone = await screen.findByLabelText("Phone text size");
  await waitFor(() => expect(screen.getByLabelText("Computer / tablet text size")).toHaveValue("large"));
  fireEvent.change(phone, { target: { value: "largest" } });
  await screen.findByText("Saved");
  expect(repository.save).toHaveBeenCalledWith("reader", "phone", "largest");
  expect(screen.getByLabelText("Computer / tablet text size")).toHaveValue("large");
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
  fireEvent(window, new Event("resize"));
  expect(screen.getByLabelText("Profile for this browser")).toHaveValue("desktop");
});

test("phone detection is independent of viewport and an explicit device choice survives reload", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
  const repository: ReadingPreferencesRepository = {
    load: vi.fn().mockResolvedValue({ phone: "largest", desktop: "normal" }),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const first = render(settings(repository));
  await waitFor(() => expect(screen.getByLabelText("Phone text size")).toHaveValue("largest"));
  expect(screen.getByLabelText("Profile for this browser")).toHaveValue("phone");
  fireEvent.change(screen.getByLabelText("Profile for this browser"), { target: { value: "desktop" } });
  first.unmount();
  render(settings(repository));
  await waitFor(() => expect(screen.getByLabelText("Phone text size")).toBeEnabled());
  expect(screen.getByLabelText("Profile for this browser")).toHaveValue("desktop");
  expect(repository.save).not.toHaveBeenCalled();
});

test("a failed save stays visibly unsaved and retry saves only that profile", async () => {
  const repository: ReadingPreferencesRepository = {
    load: vi.fn().mockResolvedValue({ phone: "normal", desktop: "large" }),
    save: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined),
  };
  render(settings(repository));
  await waitFor(() => expect(screen.getByLabelText("Phone text size")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Phone text size"), { target: { value: "largest" } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Not saved");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Saved");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(repository.save).toHaveBeenNthCalledWith(1, "reader", "phone", "largest");
  expect(repository.save).toHaveBeenNthCalledWith(2, "reader", "phone", "largest");
  expect(screen.getByLabelText("Computer / tablet text size")).toHaveValue("large");
});

test("load failure does not permit overwriting unknown settings and offers retry", async () => {
  const repository: ReadingPreferencesRepository = {
    load: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ phone: "large", desktop: "largest" }),
    save: vi.fn(),
  };
  render(settings(repository));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Phone text size")).toBeDisabled();
  expect(screen.getByLabelText("Computer / tablet text size")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByLabelText("Phone text size")).toHaveValue("large"));
  expect(screen.getByLabelText("Computer / tablet text size")).toHaveValue("largest");
  expect(repository.save).not.toHaveBeenCalled();
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
  await waitFor(() => expect(screen.getByLabelText("Computer / tablet text size")).toHaveValue("large"));
  await act(async () => finishFirst({ phone: "largest", desktop: "largest" }));
  expect(screen.getByLabelText("Phone text size")).toHaveValue("normal");
  expect(screen.getByLabelText("Computer / tablet text size")).toHaveValue("large");
});
