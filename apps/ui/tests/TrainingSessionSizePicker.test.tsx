import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TrainingSessionSizePicker } from "@/components/training/pilot/TrainingSessionSizePicker";
import type { TrainingSessionSize } from "@/lib/types";

const labels = {
  label: "Session size",
  exercisesLabel: (count: number) => `${count} exercises`,
  allDueLabel: "All due",
  allDueHelp: "Review every due card today.",
};

function ControlledPicker({
  initialValue = 10,
  onChange = vi.fn(),
}: {
  initialValue?: TrainingSessionSize;
  onChange?: (value: TrainingSessionSize) => void;
}) {
  const [value, setValue] = useState<TrainingSessionSize>(initialValue);
  return (
    <TrainingSessionSizePicker
      {...labels}
      value={value}
      onChange={(nextValue) => {
        setValue(nextValue);
        onChange(nextValue);
      }}
    />
  );
}

test("the last slider stop selects All due and shows its contextual help", () => {
  const onChange = vi.fn();
  render(<ControlledPicker onChange={onChange} />);
  const slider = screen.getByRole("slider", { name: "Session size" });

  expect(slider).toHaveAttribute("max", "6");
  expect(screen.queryByRole("button", { name: "All due" })).not.toBeInTheDocument();
  expect(screen.queryByText(labels.allDueHelp)).not.toBeInTheDocument();
  fireEvent.change(slider, { target: { value: "6" } });

  expect(onChange).toHaveBeenLastCalledWith("all-due-today");
  expect(slider).toHaveValue("6");
  expect(slider).toHaveAttribute("aria-valuetext", "All due");
  expect(screen.getByText(labels.allDueHelp)).toBeInTheDocument();

  fireEvent.change(slider, { target: { value: "5" } });
  expect(onChange).toHaveBeenLastCalledWith(50);
  expect(slider).toHaveAttribute("aria-valuetext", "50 exercises");
  expect(screen.queryByText(labels.allDueHelp)).not.toBeInTheDocument();
});

test.each([
  [0, 5], [1, 10], [2, 15], [3, 20], [4, 30], [5, 50],
])("slider stop %i selects %i exercises", (index, count) => {
  const onChange = vi.fn();
  render(<ControlledPicker initialValue="all-due-today" onChange={onChange} />);
  const slider = screen.getByRole("slider", { name: "Session size" });

  fireEvent.change(slider, { target: { value: String(index) } });
  expect(onChange).toHaveBeenCalledWith(count);
  expect(slider).toHaveAttribute("aria-valuetext", `${count} exercises`);
});

test("a saved 100 remains selected and is never relabeled as All due", () => {
  const onChange = vi.fn();
  render(<ControlledPicker initialValue={100} onChange={onChange} />);
  const slider = screen.getByRole("slider", { name: "Session size" });

  expect(slider).toHaveAttribute("max", "7");
  expect(slider).toHaveValue("6");
  expect(slider).toHaveAttribute("aria-valuetext", "100 exercises");
  expect(screen.getByText("100 exercises")).toBeInTheDocument();
  expect(screen.queryByText(labels.allDueHelp)).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();

  fireEvent.change(slider, { target: { value: "7" } });
  expect(onChange).toHaveBeenCalledWith("all-due-today");
  expect(slider).toHaveAttribute("aria-valuetext", "All due");
});
