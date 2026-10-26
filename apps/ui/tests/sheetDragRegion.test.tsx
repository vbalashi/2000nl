import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  cleanup,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  SheetDragProvider,
  SheetDragRegion,
} from "@/components/practice/ui/SheetDragRegion";
import { useResizableSheet } from "@/components/practice/ui/useResizableSheet";
afterEach(cleanup);
function Harness({ inherited = false }: { inherited?: boolean }) {
  const controller = useResizableSheet("meaning");
  const header = (
    <SheetDragRegion controller={inherited ? undefined : controller}>
      <h2>Word header</h2>
      <button>Close</button>
    </SheetDragRegion>
  );
  return (
    <section
      ref={controller.ref}
      data-testid="sheet"
      style={{ height: controller.height }}
    >
      {inherited ? (
        <SheetDragProvider value={controller}>{header}</SheetDragProvider>
      ) : (
        header
      )}
    </section>
  );
}
for (const inherited of [false, true])
  test(`header text drags while controls retain their own action (${inherited ? "Library context" : "progress controller"})`, () => {
    render(<Harness inherited={inherited} />);
    const sheet = screen.getByTestId("sheet"),
      header = screen.getByRole("heading").parentElement!;
    vi.spyOn(sheet, "getBoundingClientRect").mockImplementation(
      () => ({ height: parseFloat(sheet.style.height) }) as DOMRect,
    );
    header.setPointerCapture = vi.fn();
    header.hasPointerCapture = () => true;
    header.releasePointerCapture = vi.fn();
    const pointer = (target: Element, name: string, y: number) => {
      const event = new Event(name, { bubbles: true });
      Object.assign(event, {
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientY: y,
      });
      act(() => target.dispatchEvent(event));
    };
    pointer(screen.getByRole("button"), "pointerdown", 500);
    pointer(header, "pointermove", 400);
    expect(header.setPointerCapture).not.toHaveBeenCalled();
    const initial = parseFloat(sheet.style.height);
    pointer(screen.getByRole("heading"), "pointerdown", 500);
    pointer(header, "pointermove", 400);
    expect(parseFloat(sheet.style.height)).toBeCloseTo(initial + 100);
    pointer(header, "pointercancel", 400);
    expect(parseFloat(sheet.style.height)).toBeCloseTo(initial);
  });
