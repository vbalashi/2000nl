"use client";
import React from "react";

/** Fit actual reading content, including reserved hint space, before scrolling. */
export function useTrainingFaceFit(contentKey: string) {
  const viewport = React.useRef<HTMLDivElement>(null);
  const layout = React.useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = React.useState({ top: false, bottom: false });
  const updateScroll = React.useCallback(() => {
    const node = viewport.current;
    if (!node) return;
    const top = node.scrollTop > 2;
    const bottom = node.scrollHeight - node.clientHeight - node.scrollTop > 2;
    setScroll(previous => previous.top === top && previous.bottom === bottom ? previous : { top, bottom });
  }, []);
  React.useLayoutEffect(() => {
    const node = viewport.current, body = layout.current;
    if (!node || !body) return;
    let disposed = false, frame = 0;
    const measure = () => {
      if (disposed || !node.clientWidth || !node.clientHeight) return;
      const texts = Array.from(body.querySelectorAll<HTMLElement>("[data-face-fit]"));
      // Restore account sizes before every measurement, including viewport growth.
      texts.forEach(text => { text.style.fontSize = ""; text.style.overflowWrap = "normal"; });
      const sizes = texts.map(text => parseFloat(getComputedStyle(text).fontSize));
      const apply = (scale: number) => texts.forEach((text, index) => { text.style.fontSize = `${Math.max(Math.min(sizes[index], 22), sizes[index] * scale)}px`; });
      const fits = () => node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1 && texts.every(text => text.scrollWidth <= text.clientWidth);
      if (texts.length && !fits()) {
        apply(0);
        if (fits()) {
          let low = 0, high = 1;
          for (let step = 0; step < 8; step++) {
            const mid = (low + high) / 2;
            apply(mid);
            if (fits()) low = mid; else high = mid;
          }
          // Leave rounding room before re-enabling emergency word wrapping.
          apply(low * 0.995);
        }
      }
      // Break inside words only when a whole word cannot fit at the floor.
      texts.forEach(text => { text.style.overflowWrap = "anywhere"; });
      updateScroll();
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(node);
    resize?.observe(body);
    const preferences = new MutationObserver(schedule);
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      preferences.observe(parent, { attributes: true, attributeFilter: ["class", "style", "data-reading-size", "data-text-size"] });
    }
    void document.fonts?.ready.then(schedule);
    document.fonts?.addEventListener("loadingdone", schedule);
    return () => { disposed = true; cancelAnimationFrame(frame); resize?.disconnect(); preferences.disconnect(); document.fonts?.removeEventListener("loadingdone", schedule); };
  }, [contentKey, updateScroll]);
  return { viewport, layout, scroll, updateScroll };
}
