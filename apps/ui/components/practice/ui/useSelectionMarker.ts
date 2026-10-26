"use client";
import { useLayoutEffect, type RefObject } from "react";
export function useSelectionMarker(
  ref: RefObject<HTMLElement>,
  className: string,
  enabled = true,
) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!enabled || !root || typeof ResizeObserver === "undefined") return;
    const marker = document.createElement("span");
    marker.className = className;
    marker.setAttribute("aria-hidden", "true");
    root.append(marker);
    const update = (animate: boolean) => {
      const selected = root.querySelectorAll<HTMLElement>(
        "[aria-pressed=true],[aria-current=page]",
      );
      marker.hidden = selected.length !== 1;
      root.dataset.singleSelection = selected.length === 1 ? "true" : "false";
      if (selected.length !== 1) return;
      const a = selected[0].getBoundingClientRect(),
        b = root.getBoundingClientRect();
      marker.style.transition = animate ? "" : "none";
      marker.style.width = a.width + "px";
      marker.style.height = a.height + "px";
      marker.style.transform = `translate(${a.left - b.left}px,${a.top - b.top}px)`;
    };
    const mutations = new MutationObserver(() => update(true));
    mutations.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-pressed", "aria-current"],
    });
    const resize = new ResizeObserver(() => update(false));
    resize.observe(root);
    update(false);
    document.fonts?.ready.then(() => {
      if (marker.isConnected) update(false);
    });
    return () => {
      mutations.disconnect();
      resize.disconnect();
      marker.remove();
      delete root.dataset.singleSelection;
    };
  }, [ref, className, enabled]);
}
