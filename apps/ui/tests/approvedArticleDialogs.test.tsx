import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DialogSurface } from "@/components/practice/ui/DialogSurface";
import { SenseCardReportAction } from "@/components/feedback/SenseCardReportSheet";
import { freezeSenseCardDiagnosticSnapshot } from "@/lib/feedback/diagnosticReportClient";
import { singleSenseEntry, singleSenseGroup } from "./platformV2TrainingFixture";
import { WordDetailDrawer } from "@/components/training/wordlist/WordDetailDrawer";
import { areTrainingHotkeysSuspended } from "@/components/training/trainingHotkeys";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1", "true");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); }) });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); }) });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

test("native word panels suspend training shortcuts until their dismissal finishes", () => {
  expect(areTrainingHotkeysSuspended()).toBe(false);
  const view = render(<DialogSurface aria-label="Word" onDismiss={vi.fn()}>Reading</DialogSurface>);
  expect(screen.getByRole("dialog")).toHaveAttribute("open");
  expect(areTrainingHotkeysSuspended()).toBe(true);
  view.unmount();
  expect(areTrainingHotkeysSuspended()).toBe(false);
});

test("Report stays inside the themed word panel and closes only its own modal", async () => {
  const snapshot = freezeSenseCardDiagnosticSnapshot({ route: "library", group: singleSenseGroup, entry: singleSenseEntry });
  const closeWord = vi.fn();
  render(<div data-account-palette="graphite"><DialogSurface aria-label="Word" onDismiss={closeWord}>
    <SenseCardReportAction snapshot={snapshot} interfaceLanguage="en" />
  </DialogSurface></div>);
  const trigger = screen.getByRole("button", { name: "Report" });
  trigger.focus(); fireEvent.click(trigger);
  const report = screen.getByRole("dialog", { name: "What is wrong?" });
  expect(report.closest('[data-account-palette="graphite"]')).toBeTruthy();
  expect(report.parentElement?.closest("dialog")).toBe(screen.getByRole("dialog", { name: "Word" }));
  expect(document.documentElement.style.overflow).toBe("hidden");
  fireEvent(report, new Event("cancel", { cancelable: true }));
  await waitFor(() => expect(report).not.toBeInTheDocument());
  expect(closeWord).not.toHaveBeenCalled();
  expect(document.documentElement.style.overflow).toBe("hidden");
  await waitFor(() => expect(trigger).toHaveFocus());
});

test("Library uses the shared panel's animated dismissal on the approved path", () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  const view = render(<WordDetailDrawer selection={{ entryId: "entry-1", headword: "bank" }} open
    onClose={onClose} userId="user-1" contentLanguageCode="nl" translationLang="en"
    interfaceLanguage="ru" userLists={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toHaveAttribute("data-closing", "true");
  vi.advanceTimersByTime(340);
  expect(onClose).toHaveBeenCalledOnce();
  view.unmount(); vi.useRealTimers();
});
