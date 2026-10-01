import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TrainingExcludeAction } from "@/components/training/v2/TrainingExcludeAction";
import { getUiMessages } from "@/lib/uiMessages";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

for (const language of ["en", "nl", "ru"] as const) {
  test(`approved exclusion menu separates exclusion and known in ${language}`, () => {
    vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
    const exclude = vi.fn(), known = vi.fn();
    const t = getUiMessages(language).trainingSession.exclusion;
    render(<TrainingExcludeAction language={language} disabled={false} onClick={exclude}
      knownAction={{ label: "Known capability label", onClick: known }} />);
    const trigger = screen.getByRole("button", { name: t.help });
    fireEvent.click(trigger);
    expect(exclude).not.toHaveBeenCalled();
    expect(known).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Known capability label" }));
    expect(known).toHaveBeenCalledOnce();
    expect(exclude).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: t.label }));
    expect(exclude).toHaveBeenCalledOnce();
    expect(known).toHaveBeenCalledOnce();
  });
}

test.each([true, false])("without a known capability exclusion remains explicit, approved=%s", approved => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", String(approved));
  const exclude = vi.fn();
  render(<TrainingExcludeAction language="en" disabled={false} onClick={exclude} />);
  fireEvent.click(screen.getByRole("button"));
  expect(exclude).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("flag-off and disabled controls preserve their owner", () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "false");
  const exclude = vi.fn(), known = vi.fn();
  const { rerender } = render(<TrainingExcludeAction language="en" disabled={false}
    onClick={exclude} knownAction={{label:"Known", onClick:known}} />);
  fireEvent.click(screen.getByRole("button"));
  expect(exclude).toHaveBeenCalledOnce();
  expect(known).not.toHaveBeenCalled();
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
  rerender(<TrainingExcludeAction language="en" disabled onClick={exclude}
    knownAction={{label:"Known", onClick:known}} />);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(exclude).toHaveBeenCalledOnce();
});
