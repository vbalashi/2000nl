"use client";

import * as React from "react";

type Side = "top" | "bottom" | "left" | "right";

type Props = {
  content: React.ReactNode | null | undefined;
  children: React.ReactNode;
  side?: Side;
  /**
   * If true, the tooltip bubble is hidden on small screens (shown from `md` up).
   * Useful for mobile where "hover" tooltips can feel noisy / sticky.
   */
  hideOnMobile?: boolean;
  /**
   * If true and the child isn't focusable, the wrapper becomes focusable so
   * keyboard users can discover the tooltip.
   */
  focusable?: boolean;
  /**
   * If false, the tooltip will NOT show on focus (only on hover).
   * Useful for buttons that keep focus after click, which can make tooltips
   * feel "sticky".
   */
  showOnFocus?: boolean;
};

const EDGE_PADDING = 8;
const TOOLTIP_GAP = 8;

function getFixedPositionRoot(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    if (
      style.transform !== "none" ||
      style.filter !== "none" ||
      style.perspective !== "none" ||
      style.contain.includes("paint") ||
      style.willChange.includes("transform")
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function mergeAriaDescribedBy(
  existing: unknown,
  nextId: string
): string | undefined {
  if (typeof existing !== "string" || existing.trim().length === 0) return nextId;
  // Avoid duplicates
  const parts = existing.split(/\s+/).filter(Boolean);
  if (parts.includes(nextId)) return existing;
  return `${existing} ${nextId}`;
}

export function Tooltip({
  content,
  children,
  side = "top",
  hideOnMobile = false,
  focusable = false,
  showOnFocus = true,
}: Props) {
  const wrapperRef = React.useRef<HTMLSpanElement | null>(null);
  const tooltipRef = React.useRef<HTMLSpanElement | null>(null);
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(
    null
  );
  const id = React.useId();
  const hasContent = content != null && String(content).trim().length > 0;

  const child =
    React.isValidElement(children) && typeof children.type !== "symbol"
      ? React.cloneElement(children as React.ReactElement<any>, {
          "aria-describedby": mergeAriaDescribedBy(
            (children as any).props?.["aria-describedby"],
            id
          ),
        })
      : children;

  const updatePosition = React.useCallback(() => {
    const wrapper = wrapperRef.current;
    const tooltip = tooltipRef.current;
    if (!wrapper || !tooltip) return;

    const anchor = wrapper.getBoundingClientRect();
    const tip = tooltip.getBoundingClientRect();
    const fixedRoot = getFixedPositionRoot(wrapper);
    const rootRect = fixedRoot
      ? fixedRoot.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

    let top = 0;
    let left = 0;

    switch (side) {
      case "bottom":
        top = anchor.bottom + TOOLTIP_GAP;
        left = anchor.left + anchor.width / 2 - tip.width / 2;
        break;
      case "left":
        top = anchor.top + anchor.height / 2 - tip.height / 2;
        left = anchor.left - TOOLTIP_GAP - tip.width;
        break;
      case "right":
        top = anchor.top + anchor.height / 2 - tip.height / 2;
        left = anchor.right + TOOLTIP_GAP;
        break;
      case "top":
      default:
        top = anchor.top - TOOLTIP_GAP - tip.height;
        left = anchor.left + anchor.width / 2 - tip.width / 2;
        break;
    }

    const relativeLeft = left - rootRect.left;
    const relativeTop = top - rootRect.top;
    const maxLeft = rootRect.width - EDGE_PADDING - tip.width;
    const maxTop = rootRect.height - EDGE_PADDING - tip.height;

    const nextLeft = Math.min(
      Math.max(relativeLeft, EDGE_PADDING),
      Math.max(EDGE_PADDING, maxLeft)
    );
    const nextTop = Math.min(
      Math.max(relativeTop, EDGE_PADDING),
      Math.max(EDGE_PADDING, maxTop)
    );

    setPosition((prev) => {
      if (!prev) return { top: nextTop, left: nextLeft };
      if (Math.abs(prev.top - nextTop) < 0.5 && Math.abs(prev.left - nextLeft) < 0.5) {
        return prev;
      }
      return { top: nextTop, left: nextLeft };
    });
  }, [side]);

  React.useLayoutEffect(() => {
    if (!hasContent) return;
    updatePosition();
  }, [updatePosition, hasContent]);

  React.useEffect(() => {
    if (!hasContent) return;
    const handleScroll = () => updatePosition();
    window.addEventListener("resize", updatePosition, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [updatePosition, hasContent]);

  if (!hasContent) {
    return <>{children}</>;
  }

  return (
    <span
      className="group relative inline-flex"
      // Prevent tap-to-reveal from hijacking intended tooltip targets.
      data-no-reveal
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={focusable ? id : undefined}
      ref={wrapperRef}
      onMouseEnter={updatePosition}
      onFocus={updatePosition}
    >
      {child}
      <span
        id={id}
        role="tooltip"
        className={[
          hideOnMobile ? "hidden md:block" : "",
          "pointer-events-none fixed z-50",
          // Bubble
          // Keep tooltips single-line to match the app’s visual language.
          // Truncate long strings instead of wrapping.
          "max-w-[min(360px,calc(100vw-2rem))] truncate rounded-lg border border-slate-200 bg-white/95 px-2 py-1",
          "text-[11px] font-semibold leading-snug text-slate-700 shadow-lg shadow-slate-900/10 normal-case",
          "backdrop-blur-sm",
          "dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200 dark:shadow-slate-950/35",
          // Motion / visibility
          "origin-top opacity-0 scale-95 transition duration-150",
          "group-hover:opacity-100 group-hover:scale-100",
          showOnFocus
            ? "group-focus-within:opacity-100 group-focus-within:scale-100"
            : "",
        ].join(" ")}
        ref={tooltipRef}
        style={position ? { top: position.top, left: position.left } : undefined}
      >
        {content}
      </span>
    </span>
  );
}
