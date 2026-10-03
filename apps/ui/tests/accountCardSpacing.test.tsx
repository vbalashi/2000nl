import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AccountCardSpacingProvider } from "@/components/practice/ui/AccountCardSpacingProvider";
import { ApprovedAppearanceSection } from "@/components/practice/ui/ApprovedAppearanceSection";
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
test("account spacing selection persists without changing palette or text size and resets by owner", async () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
  const repository = {
    load: vi
      .fn()
      .mockImplementation(async (user: string) =>
        user === "a" ? "airy" : "balanced",
      ),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const view = (userId: string) => (
    <AccountCardSpacingProvider userId={userId} repository={repository}>
      <ApprovedAppearanceSection
        language="en"
        mode="light"
        onModeChange={() => {}}
      />
    </AccountCardSpacingProvider>
  );
  const { rerender } = render(view("a"));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Airy" })).toHaveAttribute(
      "aria-pressed",
      "true",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Balanced" }));
  await waitFor(() =>
    expect(repository.save).toHaveBeenCalledWith("a", "balanced"),
  );
  rerender(view("b"));
  await waitFor(() => expect(repository.load).toHaveBeenCalledWith("b"));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Balanced" })).toHaveAttribute(
      "aria-pressed",
      "true",
    ),
  );
});
test("stale owner load cannot change the next owner and failed saves expose retry", async () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
  let resolveA!: (value: "airy") => void;
  const repository = {
    load: vi.fn().mockImplementation((id: string) =>
      id === "a"
        ? new Promise((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve("balanced"),
    ),
    save: vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined),
  };
  const view = (id: string) => (
    <AccountCardSpacingProvider userId={id} repository={repository}>
      <ApprovedAppearanceSection
        language="en"
        mode="light"
        onModeChange={() => {}}
      />
    </AccountCardSpacingProvider>
  );
  const { rerender } = render(view("a"));
  rerender(view("b"));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Balanced" })).toHaveAttribute(
      "aria-pressed",
      "true",
    ),
  );
  resolveA("airy");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Airy" })).toHaveAttribute(
      "aria-pressed",
      "false",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Airy" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
  await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(2));
  expect(repository.save).toHaveBeenLastCalledWith("b", "airy");
});
