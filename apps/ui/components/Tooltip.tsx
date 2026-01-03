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

function getPositionClasses(side: Side) {
  switch (side) {
    case "bottom":
      return "top-full mt-2 left-1/2 -translate-x-1/2";
    case "left":
      return "right-full mr-2 top-1/2 -translate-y-1/2";
    case "right":
      return "left-full ml-2 top-1/2 -translate-y-1/2";
    case "top":
    default:
      return "bottom-full mb-2 left-1/2 -translate-x-1/2";
  }
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
  const id = React.useId();

  if (content == null || String(content).trim().length === 0) {
    return <>{children}</>;
  }

  const child =
    React.isValidElement(children) && typeof children.type !== "symbol"
      ? React.cloneElement(children as React.ReactElement<any>, {
          "aria-describedby": mergeAriaDescribedBy(
            (children as any).props?.["aria-describedby"],
            id
          ),
        })
      : children;

  return (
    <span
      className="group relative inline-flex"
      // Prevent tap-to-reveal from hijacking intended tooltip targets.
      data-no-reveal
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={focusable ? id : undefined}
    >
      {child}
      <span
        id={id}
        role="tooltip"
        className={[
          hideOnMobile ? "hidden md:block" : "",
          "pointer-events-none absolute z-50",
          getPositionClasses(side),
          // Bubble
          // Keep tooltips single-line to match the app’s visual language.
          // Truncate long strings instead of wrapping.
          "max-w-[min(360px,calc(100vw-2rem))] truncate rounded-lg border border-slate-200 bg-white/95 px-2 py-1",
          "text-[11px] font-semibold leading-snug text-slate-700 shadow-lg shadow-slate-900/10",
          "backdrop-blur-sm",
          "dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200 dark:shadow-slate-950/35",
          // Motion / visibility
          "origin-top opacity-0 scale-95 transition duration-150",
          "group-hover:opacity-100 group-hover:scale-100",
          showOnFocus
            ? "group-focus-within:opacity-100 group-focus-within:scale-100"
            : "",
        ].join(" ")}
      >
        {content}
      </span>
    </span>
  );
}

