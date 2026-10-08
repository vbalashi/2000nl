import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { clampSheetHeight, sheetBounds, useLibrarySheetResize } from "@/components/training/wordlist/useLibrarySheetResize";

function Harness({ id = "one", onDismiss }: { id?: string;onDismiss?:()=>void }) {
  const resize = useLibrarySheetResize(id,onDismiss);
  return <section ref={resize.ref} data-testid="sheet" style={{ height: resize.height ?? 340 }}>
    <button {...resize.handleProps} aria-expanded={resize.expanded}>Resize</button>
  </section>;
}

describe("Library sheet resizing", () => {
  test("bounds include the bottom navigation and safe area and never invert on tiny viewports", () => {
    expect(sheetBounds(900, 106)).toEqual({ min: 240, max: 786 });
    expect(sheetBounds(900, 106, 32)).toEqual({ min: 240, max: 754 });
    expect(sheetBounds(200, 72)).toEqual({ min: 50.4, max: 120 });
    expect(clampSheetHeight(999, sheetBounds(900, 106))).toBe(786);
    expect(clampSheetHeight(-20, sheetBounds(900, 106))).toBe(240);
  });
  test("keyboard resize is incremental, bounded, toggles and resets for a different article", () => {
    const { rerender } = render(<Harness />);
    const sheet = screen.getByTestId("sheet");
    vi.spyOn(sheet, "getBoundingClientRect").mockImplementation(() => ({ height: parseFloat(sheet.style.height) } as DOMRect));
    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: "ArrowUp" });
    expect(sheet.style.height).toBe("541.6px");
    fireEvent.keyDown(button, { key: "End" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(button);
    expect(sheet.style.height).toBe("240px");
    fireEvent.keyDown(button, { key: "ArrowUp" });
    rerender(<Harness id="two" />);
    expect(sheet.style.height).toBe("501.6px");
  });
  test("drag follows the pointer, snaps, ignores incidental movement and suppresses its click", () => {
    const dismiss=vi.fn();
    const { unmount } = render(<Harness onDismiss={dismiss}/>);
    const sheet = screen.getByTestId("sheet");
    vi.spyOn(sheet, "getBoundingClientRect").mockImplementation(() => ({ height: parseFloat(sheet.style.height) } as DOMRect));
    const button = screen.getByRole("button");
    button.setPointerCapture = vi.fn(); button.hasPointerCapture = () => true; button.releasePointerCapture = vi.fn();
    const pointer = (name: string, y: number) => {
      const event = new Event(name, { bubbles: true });
      Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientY: y });
      act(() => button.dispatchEvent(event));
    };
    pointer("pointerdown", 500); pointer("pointermove", 498);
    expect(sheet.style.height).toBe("501.6px");
    pointer("pointermove", 377);
    expect(sheet.style.height).toBe("624.6px");
    pointer("pointerup", 377);
    expect(sheet.style.height).toBe("501.6px");
    fireEvent.click(button, { detail: 1 });
    expect(sheet.style.height).toBe("501.6px");
    pointer("pointerdown", 377); pointer("pointermove", 277); pointer("pointercancel", 277);
    expect(sheet.style.height).toBe("501.6px");
    pointer("pointerdown", 200); pointer("pointermove", 900); pointer("pointerup",900);
    expect(dismiss).toHaveBeenCalledOnce();
    unmount();
  });
});
