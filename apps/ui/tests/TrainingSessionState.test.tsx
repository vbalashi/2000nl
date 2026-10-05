import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TrainingSessionState } from "@/components/training/v2/TrainingSessionState";
import { TrainingSessionNotice } from "@/components/training/v2/TrainingSessionSurface";
import { formatUiCount, getUiMessages } from "@/lib/uiMessages";

afterEach(() => { vi.unstubAllEnvs(); });
test.each([true,false])("terminal state preserves the owner's return action, rollout %s", approved => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1",String(approved));
  const exit=vi.fn();
  render(<TrainingSessionState title="Complete" detail="21 completed" action={{label:"Back",onClick:exit}} />);
  expect(screen.getByRole("heading",{name:"Complete"})).toBeInTheDocument();
  expect(screen.getByText("21 completed")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Back"})); expect(exit).toHaveBeenCalledOnce();
  if (approved) expect(screen.getByRole("region",{name:"Complete"})).toHaveAttribute("tabindex","0");
});
test("loading does not expose a premature return action or heading", () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1","true");
  render(<TrainingSessionState loading title="Preparing" />);
  expect(screen.getByRole("status")).toHaveTextContent("Preparing");
  expect(screen.queryByRole("heading")).toBeNull(); expect(screen.queryByRole("button")).toBeNull();
});
test("approved error retry respects the owner's busy guard", () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1","true"); const retry=vi.fn();
  const view=render(<TrainingSessionNotice notice={{kind:"error",message:"Failed",retryLabel:"Retry",retryDisabled:true,onRetry:retry}} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Failed");
  fireEvent.click(screen.getByRole("button",{name:"Retry"})); expect(retry).not.toHaveBeenCalled();
  view.rerender(<TrainingSessionNotice notice={{kind:"error",message:"Failed",retryLabel:"Retry",onRetry:retry}} />);
  fireEvent.click(screen.getByRole("button",{name:"Retry"})); expect(retry).toHaveBeenCalledOnce();
});
test.each([ ["en",1,"1 exercise completed"],["nl",1,"1 oefening voltooid"],["ru",2,"Выполнено 2 упражнения"],["ru",21,"Выполнено 21 упражнение"] ] as const)("completion detail uses %s plural form for %s",(language,count,expected)=>{
  expect(formatUiCount(language,count,getUiMessages(language).trainingSession,"completed")).toBe(expected);
});

test("failure keeps both retry and exit with their separate owners", () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
  const retry = vi.fn(), exit = vi.fn();
  render(<TrainingSessionState announcement="alert" title="Unavailable"
    action={{label:"Retry",onClick:retry}} secondaryAction={{label:"Back",onClick:exit}} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Unavailable");
  fireEvent.click(screen.getByRole("button",{name:"Retry"}));
  expect(retry).toHaveBeenCalledOnce(); expect(exit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Back"})); expect(exit).toHaveBeenCalledOnce();
});


test("pending preparation has shared loading motion and preserves manual retry", () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
  const retry=vi.fn();
  render(<TrainingSessionState loading title="Preparing translation" action={{label:"Try again",onClick:retry}} />);
  expect(screen.getByTestId("training-session-state")).toHaveAttribute("aria-busy","true");
  expect(screen.getByTestId("loading-indicator")).toHaveAttribute("aria-hidden","true");
  fireEvent.click(screen.getByRole("button",{name:"Try again"}));
  expect(retry).toHaveBeenCalledOnce();
});
