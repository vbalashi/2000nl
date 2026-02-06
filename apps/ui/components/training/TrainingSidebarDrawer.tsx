"use client";

import React from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** When true, the drawer can appear on desktop too (>= lg). */
  showOnDesktop?: boolean;
  children: React.ReactNode;
};

export function TrainingSidebarDrawer({
  open,
  onClose,
  title = "Recent & details",
  showOnDesktop = false,
  children,
}: Props) {
  const [swipeOffset, setSwipeOffset] = React.useState(0);
  const [swipeEngaged, setSwipeEngaged] = React.useState(false);
  const swipeOffsetRef = React.useRef(0);
  const swipeActiveRef = React.useRef(false);
  const swipeStartRef = React.useRef({ x: 0, y: 0 });

  const updateSwipeOffset = React.useCallback((value: number) => {
    swipeOffsetRef.current = value;
    setSwipeOffset(value);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const edgeSize = 28;
    const closeThreshold = 90;
    const maxOffset = 220;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (touch.clientX > edgeSize) return;
      swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
      swipeActiveRef.current = true;
      setSwipeEngaged(false);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!swipeActiveRef.current) return;
      const touch = event.touches[0];
      const dx = touch.clientX - swipeStartRef.current.x;
      const dy = touch.clientY - swipeStartRef.current.y;
      if (dx <= 0 || Math.abs(dx) < Math.abs(dy)) return;
      event.preventDefault();
      setSwipeEngaged(true);
      updateSwipeOffset(Math.min(dx, maxOffset));
    };

    const finishSwipe = () => {
      if (!swipeActiveRef.current) return;
      const shouldClose = swipeOffsetRef.current > closeThreshold;
      swipeActiveRef.current = false;
      setSwipeEngaged(false);
      updateSwipeOffset(0);
      if (shouldClose) onClose();
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", finishSwipe);
    window.addEventListener("touchcancel", finishSwipe);

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", finishSwipe);
      window.removeEventListener("touchcancel", finishSwipe);
    };
  }, [open, onClose, updateSwipeOffset]);

  if (!open) return null;

  const overlayOpacity = Math.max(0.1, 0.3 - swipeOffset / 700);

  return (
    <div className={`fixed inset-0 z-40${showOnDesktop ? "" : " lg:hidden"}`}>
      <div
        className="absolute inset-0 bg-black/30"
        style={{ opacity: overlayOpacity }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="absolute inset-y-0 right-0 w-full max-w-full sm:w-[460px]">
        <div
          className="relative h-full bg-white shadow-2xl dark:bg-slate-900"
          style={{
            transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
            transition: swipeEngaged ? "none" : "transform 200ms ease-out",
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
            {/* Title is intentionally not shown (tabs already label content). */}
            <span className="sr-only">{title}</span>
            {/* Spacer so the close button sits on the right (sr-only is absolute). */}
            <div className="flex-1" />

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800/60"
            >
              Sluiten
            </button>
          </div>

          <div className="h-[calc(100%-52px)] p-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
