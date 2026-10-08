import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { TrainingBootstrapShell } from "@/components/training/pilot/TrainingBootstrapShell";
import { AccountPracticeAppearanceProvider } from "@/components/practice/ui/AccountPracticeAppearanceProvider";
import { AccountPresentationReady } from "@/components/practice/ui/AccountPresentationReady";
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
test.each(["en", "ru", "nl"] as const)("auth, palette and hydration waits share identical markup in %s", language => {
  const pending = { load: vi.fn(() => new Promise<"graphite">(() => {})), save: vi.fn() };
  const view = render(<TrainingBootstrapShell interfaceLanguage={language} />);
  const initial = view.getByTestId("startup-logo-screen").innerHTML;
  view.rerender(<TrainingBootstrapShell interfaceLanguage={language} status="long-running" />);
  expect(view.getByTestId("startup-logo-screen").innerHTML).toBe(initial);
  view.rerender(<AccountPracticeAppearanceProvider userId="owner" interfaceLanguage={language} repository={pending} requireReady><p>ready</p></AccountPracticeAppearanceProvider>);
  expect(view.getByTestId("startup-logo-screen").innerHTML).toBe(initial);
  view.rerender(<AccountPracticeAppearanceProvider userId="owner" repository={pending}><AccountPresentationReady language={language}><p>ready</p></AccountPresentationReady></AccountPracticeAppearanceProvider>);
  expect(view.getByTestId("startup-logo-screen").innerHTML).toBe(initial);
});
test("unknown interface language preserves the same dots while accessible copy becomes ready", () => {
  const view = render(<TrainingBootstrapShell interfaceLanguage="ru" interfaceLanguageReady={false} />);
  const status = view.getByRole("status");
  const dots = status.querySelector(".startup-dots");
  expect(dots?.children).toHaveLength(3);
  expect(view.queryByRole("heading")).not.toBeInTheDocument();
  view.rerender(<TrainingBootstrapShell interfaceLanguage="ru" interfaceLanguageReady />);
  expect(view.getByRole("heading")).toHaveTextContent("Подготавливаем тренировку");
  expect(view.getByRole("heading")).toHaveClass("sr-only");
  expect(status.querySelector(".startup-dots")).toBe(dots);
});
