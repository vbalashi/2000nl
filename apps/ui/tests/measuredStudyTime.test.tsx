import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/training/studyTime/useStudyTimeWindow", () => ({ useStudyTimeWindow: read }));
import { MeasuredStudyTime } from "@/components/practice/MeasuredStudyTime";
const page = { timezone: "Europe/Amsterdam", asOf: "2026-09-30T10:00:00Z", startDate: "2026-09-30", endDate: "2026-09-30", coverageStartedAt: "2026-09-30T09:00:00Z", days: [{ date: "2026-09-30", activeMilliseconds: 70000 }] };
beforeEach(() => { vi.clearAllMocks(); read.mockReturnValue({ status: "ready", window: page }); });
test("partial coverage is visible beside measured time, periods don't relabel other counters", () => {
  render(<MeasuredStudyTime ownerId="owner" languageCode="nl" interfaceLanguage="en" open />);
  expect(screen.getByText("1 min")).toBeInTheDocument();
  expect(screen.getByText(/Measured since/)).toBeInTheDocument();
  expect(screen.getByText(/all training in this language/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Week" }));
  expect(read.mock.lastCall?.[2]).toBe("Week");
});
test("errors and unmeasured periods never appear as zero; retry triggers a new read", () => {
  read.mockReturnValue({ status: "error" });
  const view = render(<MeasuredStudyTime ownerId="owner" languageCode="nl" interfaceLanguage="en" open />);
  expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
  expect(screen.queryByText("0 min")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(read.mock.lastCall?.[4]).toBe(1);
  read.mockReturnValue({ status: "ready", window: { ...page, coverageStartedAt: "2026-10-01T09:00:00Z" } });
  view.rerender(<MeasuredStudyTime ownerId="owner" languageCode="nl" interfaceLanguage="en" open />);
  expect(screen.getByText("Time was not measured during this period.")).toBeInTheDocument();
  expect(screen.queryByText("0 min")).not.toBeInTheDocument();
});
test("small positive durations remain visible; locale changes preserve period and use localized copy", () => {
  read.mockReturnValue({ status: "ready", window: { ...page, days: [{ date: "2026-09-30", activeMilliseconds: 3000 }] } });
  const view = render(<MeasuredStudyTime ownerId="owner" languageCode="nl" interfaceLanguage="en" open />);
  expect(screen.getByText("<1 min")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Month" }));
  view.rerender(<MeasuredStudyTime ownerId="owner" languageCode="nl" interfaceLanguage="ru" open />);
  expect(screen.getByText("<1 мин")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Месяц" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("heading", { name: "Время занятий" })).toBeInTheDocument();
});
