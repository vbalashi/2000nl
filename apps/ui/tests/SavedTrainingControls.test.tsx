import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { SavedTrainingControls } from "@/components/practice/SavedTrainingControls";
const prototype = HTMLDialogElement.prototype;
const show = Object.getOwnPropertyDescriptor(prototype, "showModal");
const close = Object.getOwnPropertyDescriptor(prototype, "close");
beforeAll(() => { Object.defineProperties(prototype, {
  showModal: { configurable: true, value() { this.setAttribute("open", ""); } },
  close: { configurable: true, value() { this.removeAttribute("open"); } },
}); });
afterAll(() => {
  if (show) Object.defineProperty(prototype, "showModal", show); else Reflect.deleteProperty(prototype, "showModal");
  if (close) Object.defineProperty(prototype, "close", close); else Reflect.deleteProperty(prototype, "close");
});
const props = { name: "Words", main: false, hasOthers: false, language: "en" as const, onMain: vi.fn(), onDelete: vi.fn() };
test("main action is direct and current-main state cannot be selected again", () => {
  const onMain = vi.fn();
  const { rerender } = render(<SavedTrainingControls {...props} onMain={onMain} />);
  fireEvent.click(screen.getByRole("button", { name: "Use as main training" }));
  expect(onMain).toHaveBeenCalledOnce();
  rerender(<SavedTrainingControls {...props} main onMain={onMain} />);
  expect(screen.getByRole("button", { name: "Main training" })).toBeDisabled();
});
test("delete confirms only the setup and cancellation returns focus to its opener", () => {
  const onDelete = vi.fn(); render(<SavedTrainingControls {...props} onDelete={onDelete} />);
  const opener = screen.getByRole("button", { name: "Delete training" }); opener.focus(); fireEvent.click(opener);
  expect(screen.getByRole("dialog")).toHaveTextContent("Your learning progress is kept.");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onDelete).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(opener).toHaveFocus();
});
test("a failed delete keeps the confirmation open; successful retry closes it", async () => {
  const onDelete = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  render(<SavedTrainingControls {...props} main hasOthers onDelete={onDelete} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete training" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("The next saved training will become your main training.");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete training" }));
  await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete training" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
test("pending changes disable repeated main/delete actions", () => {
  render(<SavedTrainingControls {...props} pending />);
  expect(screen.getByRole("button", { name: "Use as main training" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Delete training" })).toBeDisabled();
});
