"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

const duration = 420;
type Snapshot = { clone: HTMLElement; rect: DOMRect };

/** A visual-only snapshot keeps the first frame intact when React replaces the face. */
function snapshot(node: HTMLElement): Snapshot {
  const clone = node.cloneNode(true) as HTMLElement;
  const sourceNodes = [node, ...node.querySelectorAll<HTMLElement>("*")];
  const cloneNodes = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  sourceNodes.forEach((source, index) => {
    const style = getComputedStyle(source);
    cloneNodes[index].style.cssText = Array.from(style)
      .map(key => `${key}:${style.getPropertyValue(key)};`).join("");
    // Preserve relative sizes so a captured headword can become a smaller expression.
    if (index > 0) {
      const parentSize = parseFloat(getComputedStyle(source.parentElement!).fontSize);
      const size = parseFloat(style.fontSize);
      if (parentSize && size) cloneNodes[index].style.fontSize = `${size / parentSize}em`;
      const leading = parseFloat(style.lineHeight);
      if (size && leading) cloneNodes[index].style.lineHeight = `${leading / size}em`;
    }
    cloneNodes[index].removeAttribute("id");
    cloneNodes[index].removeAttribute("data-testid");
    cloneNodes[index].removeAttribute("tabindex");
  });
  clone.setAttribute("aria-hidden", "true");
  clone.inert = true;
  clone.dataset.trainingRevealOverlay = "true";
  return { clone, rect: node.getBoundingClientRect() };
}

/** No learning state lives here: this only owns motion and its temporary action lock. */
export function useTrainingPromptReveal({ root, revealed, enabled, identity, source, target }: {
  root: RefObject<HTMLElement>;
  revealed: boolean;
  enabled: boolean;
  identity: string;
  source: (root: HTMLElement) => HTMLElement | null;
  target: (root: HTMLElement) => HTMLElement | null;
}) {
  const pending = useRef<Snapshot | null>(null);
  const [moving, setMoving] = useState(false);
  const capture = useCallback(() => {
    pending.current = null;
    if (!enabled || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const node = root.current && source(root.current);
    if (node?.animate) pending.current = snapshot(node);
  }, [enabled, root, source]);

  useLayoutEffect(() => {
    const from = pending.current;
    pending.current = null;
    const node = revealed && enabled && root.current ? target(root.current) : null;
    if (!from || !node || !node.animate) { setMoving(false); return; }
    const to = node.getBoundingClientRect();
    if (!from.rect.width || !to.width) { setMoving(false); return; }
    const overlay = from.clone;
    Object.assign(overlay.style, {
      position: "fixed", left: `${from.rect.left}px`, top: `${from.rect.top}px`,
      width: `${from.rect.width}px`, height: "auto", margin: "0", minWidth: "0",
      maxWidth: "none", pointerEvents: "none", zIndex: "50", transform: "none",
    });
    const visibility = node.style.visibility;
    node.style.visibility = "hidden";
    document.body.append(overlay);
    setMoving(true);
    let handoffFrame = 0;
    const restore = () => {
      cancelAnimationFrame(handoffFrame);
      overlay.remove(); node.style.visibility = visibility;
    };
    let animation: Animation;
    try {
      animation = overlay.animate([
        { transform: "translate(0,0)", width: `${from.rect.width}px`, fontSize: overlay.style.fontSize },
        { transform: `translate(${to.left - from.rect.left}px,${to.top - from.rect.top}px)`, width: `${to.width}px`, fontSize: getComputedStyle(node).fontSize },
      ], { duration, fill: "both", easing: "cubic-bezier(.22,1,.36,1)" });
    } catch {
      restore(); setMoving(false); return;
    }
    animation.onfinish = () => {
      node.style.visibility = visibility;
      setMoving(false);
      // The answer container fades in after motion. Keep the arrived question
      // over it until the real text is opaque, avoiding a blank handoff frame.
      let frames = 0;
      const handoff = () => {
        let opacity = 1;
        for (let ancestor: HTMLElement | null = node; ancestor; ancestor = ancestor.parentElement) {
          const value = getComputedStyle(ancestor).opacity;
          opacity *= value === "" ? 1 : Number(value);
        }
        if (opacity >= 0.999 || !node.isConnected || ++frames >= 60) {
          restore();
        } else {
          handoffFrame = requestAnimationFrame(handoff);
        }
      };
      handoff();
    };
    animation.oncancel = () => { restore(); setMoving(false); };
    const cancel = () => animation.cancel();
    window.addEventListener("resize", cancel);
    return () => {
      window.removeEventListener("resize", cancel);
      animation.onfinish = null;
      animation.oncancel = null;
      animation.cancel();
      restore();
    };
  }, [revealed, enabled, identity, root, target]);
  return { capture, moving };
}
