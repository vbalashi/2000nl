"use client";
import React from "react";

/** Keep a whole headword together before using its optional syllable wrap points. */
export function useHeadwordFit(key: string, enabled = true, centered = false) {
  const row = React.useRef<HTMLDivElement>(null);
  const word = React.useRef<HTMLHeadingElement>(null);
  const article = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => {
    const container = row.current, heading = word.current;
    if (!container || !heading) return;
    if (!enabled) {
      heading.style.fontSize = "";
      heading.style.whiteSpace = "";
      container.style.flexDirection = "";
      container.style.alignItems = "";
      container.style.justifyContent = "";
      if (article.current) article.current.style.fontSize = "";
      delete heading.dataset.headwordFit;
      delete container.dataset.articleStacked;
      return;
    }
    let disposed = false;
    const measure = () => {
      const width = container.clientWidth;
      if (disposed || !width) return;
      heading.style.fontSize = "";
      if (article.current) article.current.style.fontSize = "";
      heading.style.maxWidth = "100%";
      const style = getComputedStyle(heading);
      const baseSize = parseFloat(style.fontSize);
      const probe = heading.cloneNode(true) as HTMLHeadingElement;
      probe.querySelectorAll("wbr").forEach(node=>node.remove());
      Object.assign(probe.style, {
        position: "fixed", visibility: "hidden", whiteSpace: "nowrap", width:"max-content", maxWidth:"none", margin:"0",
        fontFamily: style.fontFamily, fontSize: style.fontSize,
        fontWeight: style.fontWeight, fontStyle: style.fontStyle,
        letterSpacing: style.letterSpacing,
      });
      document.body.appendChild(probe);
      const naturalWidth = probe.getBoundingClientRect().width;
      probe.remove();
      if (!naturalWidth || !baseSize) return;
      const articleSize = article.current ? parseFloat(getComputedStyle(article.current).fontSize) : 0;
      const articleWidth = article.current?.getBoundingClientRect().width ?? 0;
      const gap = parseFloat(getComputedStyle(container).columnGap) || 0;
      // Give the word the entire line before reducing its size.
      const stacked = articleWidth > 0 && naturalWidth + articleWidth + gap > width;
      container.style.flexDirection = stacked ? "column" : "row";
      container.style.alignItems = centered && stacked ? "center" : "baseline";
      container.style.justifyContent = centered && !stacked ? "center" : "";
      container.dataset.articleStacked = String(stacked);
      const available = width - (stacked ? 0 : articleWidth + (articleWidth ? gap : 0));
      const minimum = Math.min(baseSize, Math.max(20, baseSize * 0.6));
      const size = Math.max(minimum, Math.min(baseSize, baseSize * available / naturalWidth));
      heading.style.fontSize = `${size}px`;
      if (article.current) article.current.style.fontSize = `${articleSize * size / baseSize}px`;
      heading.style.whiteSpace = naturalWidth * size / baseSize <= available + 0.5 ? "nowrap" : "normal";
      heading.dataset.headwordFit = heading.style.whiteSpace === "nowrap" ? "single-line" : "wrap";
    };
    measure();
    if (typeof ResizeObserver === "undefined") return () => {disposed=true;};
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(heading);
    void document.fonts?.ready.then(measure);
    // Reading preferences change inherited CSS variables even when the fixed
    // heading dimensions remain unchanged, so ResizeObserver alone misses them.
    const preferences = new MutationObserver(measure);
    for (let parent = container.parentElement; parent; parent = parent.parentElement) {
      preferences.observe(parent, { attributes: true, attributeFilter: ["style", "class", "data-reading-size", "data-text-size"] });
    }
    return () => { disposed = true; observer.disconnect(); preferences.disconnect(); };
  }, [key, enabled, centered]);
  return { row, word, article };
}
