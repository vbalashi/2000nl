import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useTrainingPromptReveal } from "@/components/practice/ui/useTrainingPromptReveal";

const source = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-face]");
const target = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-answer]");
function Harness() {
  const root = React.useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = React.useState(false);
  const { capture, moving } = useTrainingPromptReveal({ root, revealed, enabled: true,
    identity: "sense-1", source, target });
  return <div ref={root}>
    {revealed ? <p data-answer style={{ fontSize: 20 }}>Question</p> : <p data-face style={{ fontSize: 40 }}>Question</p>}
    <button onClick={() => { capture(); setRevealed(true); }}>Reveal</button>
    <button disabled={moving}>Grade</button>
  </div>;
}
function motion(reduced = false) {
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  const animation = { onfinish: null as (() => void) | null, oncancel: null as (() => void) | null, cancel: vi.fn() };
  const animate = vi.fn((..._args: Parameters<HTMLElement["animate"]>) => animation as unknown as Animation);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { left: 20, top: this.hasAttribute("data-face") ? 200 : 80, width: 160, height: 48 } as DOMRect;
  });
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  return { animation, animate };
}
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

test("keeps a visible first-frame copy at the captured origin and locks grading until arrival", () => {
  const { animation, animate } = motion();
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
  const overlay = document.querySelector<HTMLElement>("[data-training-reveal-overlay]")!;
  expect(overlay.style.top).toBe("200px");
  expect(overlay.getAttribute("aria-hidden")).toBe("true");
  expect(document.querySelector<HTMLElement>("[data-answer]")!.style.visibility).toBe("hidden");
  expect(screen.getByRole("button", { name: "Grade" })).toBeDisabled();
  expect(animate.mock.calls[0][0]).toEqual([
    expect.objectContaining({ transform: "translate(0,0)" }),
    expect.objectContaining({ transform: "translate(0px,-120px)" }),
  ]);
  act(() => animation.onfinish?.());
  expect(document.querySelector("[data-training-reveal-overlay]")).toBeNull();
  expect(document.querySelector<HTMLElement>("[data-answer]")!.style.visibility).toBe("");
  expect(screen.getByRole("button", { name: "Grade" })).toBeEnabled();
});

test("reduced motion reveals immediately without a visual copy or lock", () => {
  const { animate } = motion(true);
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
  expect(animate).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Grade" })).toBeEnabled();
  expect(document.querySelector("[data-training-reveal-overlay]")).toBeNull();
});

test("unmount cancels animation and removes the inert copy", () => {
  const { animation } = motion();
  const { unmount } = render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
  unmount();
  expect(animation.cancel).toHaveBeenCalled();
  expect(document.querySelector("[data-training-reveal-overlay]")).toBeNull();
});

test("a cancelled animation restores the answer and unlocks grading", () => {
  const { animation } = motion();
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
  act(() => animation.oncancel?.());
  expect(document.querySelector("[data-training-reveal-overlay]")).toBeNull();
  expect(document.querySelector<HTMLElement>("[data-answer]")!.style.visibility).toBe("");
  expect(screen.getByRole("button", { name: "Grade" })).toBeEnabled();
});

test("unsupported animation execution falls back to a usable answer", () => {
  const { animate } = motion();
  animate.mockImplementation(() => { throw new Error("Unsupported animation"); });
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
  expect(document.querySelector("[data-training-reveal-overlay]")).toBeNull();
  expect(document.querySelector<HTMLElement>("[data-answer]")!.style.visibility).toBe("");
  expect(screen.getByRole("button", { name: "Grade" })).toBeEnabled();
});


test("keeps the arrived prompt visible while its answer ancestor fades in", () => {
  const { animation } = motion();
  let nextFrame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { nextFrame = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
  const answer = document.querySelector<HTMLElement>("[data-answer]")!;
  answer.parentElement!.style.opacity = "0";
  act(() => animation.onfinish?.());
  expect(document.querySelector("[data-training-reveal-overlay]")).not.toBeNull();
  expect(answer.style.visibility).toBe("");
  answer.parentElement!.style.opacity = "0.5";
  act(() => nextFrame?.(16));
  expect(document.querySelector("[data-training-reveal-overlay]")).not.toBeNull();
  answer.parentElement!.style.opacity = "1";
  act(() => nextFrame?.(32));
  expect(document.querySelector("[data-training-reveal-overlay]")).toBeNull();
});
