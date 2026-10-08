import React from "react";

export function sheetBounds(viewportHeight: number, bottom: number) {
  const max = Math.max(0, viewportHeight - bottom - 8);
  return { min: Math.min(240, max * 0.42), max };
}
export function clampSheetHeight(
  height: number,
  bounds: { min: number; max: number },
) {
  return Math.max(bounds.min, Math.min(bounds.max, height));
}

/** Handle-only gestures leave the article's independent scrolling untouched. */
export function useResizableSheet(
  resetKey: string | null,
  onDismiss?: () => void,
) {
  const ref = React.useRef<HTMLElement>(null);
  const [height, setHeight] = React.useState<number>();
  const [expanded, setExpanded] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const gesture = React.useRef<{
    id: number;
    y: number;
    height: number;
    currentHeight: number;
    moved: boolean;
  }>();
  const suppressClick = React.useRef(false);
  const bounds = React.useCallback(
    () =>
      sheetBounds(
        window.visualViewport?.height ?? window.innerHeight,
        ref.current
          ? parseFloat(getComputedStyle(ref.current).bottom) || 0
          : 72,
      ),
    [],
  );
  const update = React.useCallback(
    (value: number) => {
      const limits = bounds();
      const next = clampSheetHeight(value, limits);
      setHeight(next);
      setExpanded(next >= limits.max - 1);
    },
    [bounds],
  );
  React.useEffect(() => {
    setHeight(ref.current ? bounds().max * 0.66 : undefined);
    setExpanded(false);
    setDragging(false);
    gesture.current = undefined;
    suppressClick.current = false;
  }, [resetKey, bounds]);
  React.useEffect(() => {
    const resize = () => {
      if (ref.current) update(ref.current.getBoundingClientRect().height);
    };
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [update]);
  const finish = (
    event: React.PointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    suppressClick.current = current.moved;
    if (cancelled && current.moved) update(current.height);
    else if (current.moved) {
      const limits = bounds();
      if (current.currentHeight < limits.min * 0.62 && onDismiss) onDismiss();
      else {
        const stops = [limits.min, limits.max * 0.66, limits.max];
        update(
          stops.reduce((a, b) =>
            Math.abs(b - current.currentHeight) <
            Math.abs(a - current.currentHeight)
              ? b
              : a,
          ),
        );
      }
    }
    gesture.current = undefined;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return {
    ref,
    height,
    expanded,
    dragging,
    handleProps: {
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!event.isPrimary || event.button !== 0 || !ref.current) return;
        suppressClick.current = false;
        gesture.current = {
          id: event.pointerId,
          y: event.clientY,
          height: ref.current.getBoundingClientRect().height,
          currentHeight: ref.current.getBoundingClientRect().height,
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        const delta = current.y - event.clientY;
        if (!current.moved && Math.abs(delta) < 5) return;
        current.moved = true;
        setDragging(true);
        current.currentHeight = Math.max(
          48,
          Math.min(bounds().max, current.height + delta),
        );
        setHeight(current.currentHeight);
      },
      onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) =>
        finish(event),
      onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) =>
        finish(event, true),
      onLostPointerCapture: (event: React.PointerEvent<HTMLButtonElement>) =>
        finish(event, true),
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        if (suppressClick.current && event.detail !== 0) {
          suppressClick.current = false;
          return;
        }
        suppressClick.current = false;
        const limits = bounds();
        const current =
          ref.current?.getBoundingClientRect().height ?? limits.max * 0.66;
        const stops = [limits.min, limits.max * 0.66, limits.max];
        const closest = stops.reduce(
          (best, v, i) =>
            Math.abs(v - current) < Math.abs(stops[best] - current) ? i : best,
          0,
        );
        update(stops[(closest + 1) % 3]);
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        const limits = bounds();
        const current =
          ref.current?.getBoundingClientRect().height ?? limits.min;
        const steps: Record<string, number> = {
          ArrowUp: current + 40,
          ArrowDown: current - 40,
          Home: limits.min,
          End: limits.max,
        };
        const next = steps[event.key];
        if (next === undefined) return;
        event.preventDefault();
        update(next);
      },
    },
  };
}
