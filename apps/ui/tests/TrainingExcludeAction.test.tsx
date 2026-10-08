import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TrainingExcludeAction } from "@/components/training/v2/TrainingExcludeAction";
import { getUiMessages } from "@/lib/uiMessages";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

for (const language of ["en", "nl", "ru"] as const) {
  test(`approved exclusion menu separates exclusion and known in ${language}`, () => {
    const exclude = vi.fn(), known = vi.fn();
    const t = getUiMessages(language).trainingSession.exclusion;
    render(<TrainingExcludeAction language={language} disabled={false} onClick={exclude}
      knownAction={{ label: "Known capability label", onClick: known }} />);
    const trigger = screen.getByRole("button", { name: t.help });
    fireEvent.click(trigger);
    expect(exclude).not.toHaveBeenCalled();
    expect(known).not.toHaveBeenCalled();
    expect(screen.getByText(t.help)).toBeVisible();
    expect(screen.getByText(getUiMessages(language).cardActions.knownHelp)).toBeVisible();
    expect(screen.getByRole("menuitem", {name:t.label})).toHaveAccessibleDescription(t.help);
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

test("without a known capability exclusion remains explicit", () => {
  const exclude = vi.fn();
  render(<TrainingExcludeAction language="en" disabled={false} onClick={exclude} />);
  fireEvent.click(screen.getByRole("button"));
  expect(exclude).not.toHaveBeenCalled();
  expect(screen.getByRole("menu")).toBeVisible();
  fireEvent.click(screen.getByRole("menuitem", { name: "Exclude" }));
  expect(exclude).toHaveBeenCalledOnce();
});

test("disabled controls preserve their owner", () => {
  const exclude = vi.fn(), known = vi.fn();
  render(<TrainingExcludeAction language="en" disabled onClick={exclude}
    knownAction={{label:"Known", onClick:known}} />);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(exclude).not.toHaveBeenCalled();
  expect(known).not.toHaveBeenCalled();
});
