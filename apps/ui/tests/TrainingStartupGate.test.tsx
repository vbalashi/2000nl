import React, {useEffect} from "react";
import {act, cleanup, render, screen} from "@testing-library/react";
import {afterEach, expect, test, vi} from "vitest";
import {TrainingStartupGate} from "@/components/training/pilot/TrainingStartupGate";
afterEach(() => {cleanup(); vi.useRealTimers(); vi.unstubAllEnvs();});
test("startup readers stay mounted while the neutral surface covers intermediate UI", () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
  const mounted = vi.fn(), unmounted = vi.fn();
  function Reader() {useEffect(() => {mounted(); return unmounted;}, []); return <button>Start training</button>;}
  const {rerender} = render(<TrainingStartupGate pending interfaceLanguage="en"><Reader /></TrainingStartupGate>);
  expect(screen.getByTestId("startup-logo-screen")).toBeVisible();
  expect(screen.queryByRole("button", {name: "Start training"})).toBeNull();
  rerender(<TrainingStartupGate pending={false} interfaceLanguage="en"><Reader /></TrainingStartupGate>);
  expect(screen.getByRole("button", {name: "Start training"})).toBeVisible();
  expect(screen.queryByTestId("startup-logo-screen")).toBeNull();
  expect(mounted).toHaveBeenCalledOnce(); expect(unmounted).not.toHaveBeenCalled();
});
test("long-running startup keeps stable copy without concealing a settled error", () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true"); vi.useFakeTimers();
  const {rerender} = render(<TrainingStartupGate pending interfaceLanguage="en"><div role="alert">Could not load</div></TrainingStartupGate>);
  const before = screen.getByRole("status").innerHTML;
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.getByRole("status").innerHTML).toBe(before);
  expect(screen.getByRole("status")).toHaveTextContent("Preparing training");
  rerender(<TrainingStartupGate pending={false} interfaceLanguage="en"><div role="alert">Could not load</div></TrainingStartupGate>);
  expect(screen.getByRole("alert")).toBeVisible();
});
