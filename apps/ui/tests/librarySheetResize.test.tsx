import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { clampSheetHeight, sheetBounds, useLibrarySheetResize } from "@/components/training/wordlist/useLibrarySheetResize";

function Harness({ id = "one" }: { id?: string }) {
  const resize = useLibrarySheetResize(id);
  return <section ref={resize.ref} data-testid="sheet" style={{ height: resize.height ?? 340 }}>
    <button {...resize.handleProps} aria-expanded={resize.expanded}>Resize</button>
  </section>;
}

describe("Library sheet resizing", () => {
  test("bounds include the bottom navigation and safe area and never invert on tiny viewports", () => {
    expect(sheetBounds(900, 106)).toEqual({ min: 340, max: 786 });
    expect(sheetBounds(200, 72)).toEqual({ min: 120, max: 120 });
    expect(clampSheetHeight(999, sheetBounds(900, 106))).toBe(786);
    expect(clampSheetHeight(-20, sheetBounds(900, 106))).toBe(340);
  });
  test("keyboard resize is incremental, bounded, toggles and resets for a different article", () => {
    const { rerender } = render(<Harness />);
    const sheet = screen.getByTestId("sheet");
    vi.spyOn(sheet, "getBoundingClientRect").mockImplementation(() => ({ height: parseFloat(sheet.style.height) } as DOMRect));
    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: "ArrowUp" });
    expect(sheet.style.height).toBe("380px");
    fireEvent.keyDown(button, { key: "End" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(button);
    expect(sheet.style.height).toBe("340px");
    fireEvent.keyDown(button, { key: "ArrowUp" });
    rerender(<Harness id="two" />);
    expect(sheet.style.height).toBe("340px");
  });
  test("drag preserves arbitrary height, ignores incidental movement and suppresses its click", () => {
    const { unmount } = render(<Harness />);
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
    expect(sheet.style.height).toBe("340px");
    pointer("pointermove", 377); pointer("pointerup", 377);
    expect(sheet.style.height).toBe("463px");
    fireEvent.click(button, { detail: 1 });
    expect(sheet.style.height).toBe("463px");
    pointer("pointerdown", 377); pointer("pointermove", 277); pointer("pointercancel", 277);
    expect(sheet.style.height).toBe("463px");
    unmount();
  });
});
