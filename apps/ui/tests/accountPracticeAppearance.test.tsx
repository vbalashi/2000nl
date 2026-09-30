import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  AccountPracticeAppearanceProvider,
  useAccountPracticeAppearance,
} from "@/components/practice/ui/AccountPracticeAppearanceProvider";
import { ApprovedAppearanceSection } from "@/components/practice/ui/ApprovedAppearanceSection";
import { applyResolvedTheme } from "@/lib/preferences/resolvedTheme";
import type { PracticePaletteRepository } from "@/lib/preferences/practicePaletteRepository";
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
function State() {
  const state = useAccountPracticeAppearance();
  return <output>{state?.palette ?? "off"}</output>;
}
function view(repository: PracticePaletteRepository, userId = "a") {
  return (
    <AccountPracticeAppearanceProvider userId={userId} repository={repository}>
      <ApprovedAppearanceSection
        language="en"
        mode="system"
        onModeChange={() => {}}
      />
      <State />
    </AccountPracticeAppearanceProvider>
  );
}
test("gate off does not query account settings", () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "false");
  const repository = { load: vi.fn(), save: vi.fn() };
  render(view(repository));
  expect(repository.load).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toBe("off");
});
test("loads account palette, saves only the selected palette, blocks duplicate submissions", async () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
  let complete!: () => void;
  const repository = {
    load: vi.fn().mockResolvedValue("blue"),
    save: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    ),
  };
  render(view(repository));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Blue" }).getAttribute("aria-pressed"),
    ).toBe("true"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Graphite" }));
  fireEvent.click(screen.getByRole("button", { name: "Lavender" }));
  expect(repository.save).toHaveBeenCalledOnce();
  expect(repository.save).toHaveBeenCalledWith("a", "graphite");
  await act(async () => complete());
  expect(await screen.findByText("Saved to your account.")).toBeTruthy();
});
test("load and save failures allow explicit retry without replacing account ownership", async () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
  const repository = {
    load: vi
      .fn()
      .mockRejectedValueOnce(new Error())
      .mockResolvedValue("lavender"),
    save: vi
      .fn()
      .mockRejectedValueOnce(new Error())
      .mockResolvedValue(undefined),
  };
  render(view(repository));
  await screen.findByText("Appearance could not be loaded.");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Blue" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Blue" }));
  await screen.findByText("Appearance could not be saved.");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Saved to your account.");
  expect(repository.save.mock.calls).toEqual([
    ["a", "blue"],
    ["a", "blue"],
  ]);
});
test("late load from the previous account cannot change the new account palette", async () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
  let finish!: (value: "blue") => void;
  const repository = {
    load: vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (finish = resolve)),
      )
      .mockResolvedValue("graphite"),
    save: vi.fn(),
  };
  const rendered = render(view(repository));
  rendered.rerender(view(repository, "b"));
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Graphite" })
        .getAttribute("aria-pressed"),
    ).toBe("true"),
  );
  await act(async () => finish("blue"));
  expect(
    screen
      .getByRole("button", { name: "Graphite" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});
test("system changes respect explicit account theme until the controller releases it", () => {
  const root = document.createElement("div");
  applyResolvedTheme(root, true);
  expect(root.classList.contains("dark")).toBe(true);
  root.dataset.accountThemeMode = "light";
  applyResolvedTheme(root, true);
  expect(root.classList.contains("dark")).toBe(false);
  root.dataset.accountThemeMode = "dark";
  applyResolvedTheme(root, false);
  expect(root.classList.contains("dark")).toBe(true);
  delete root.dataset.accountThemeMode;
  applyResolvedTheme(root, false);
  expect(root.classList.contains("dark")).toBe(false);
});
