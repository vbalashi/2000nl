"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import s from "../library/libraryOverlays.module.css";

export type ActionMenuItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  onSelect: () => void;
};

/** Anchored native popover stays above dialogs and inherits their theme. */
export function ActionMenu({ anchor, title, language, items, onClose }: {
  anchor: HTMLButtonElement;
  title: string;
  language: string;
  items: ActionMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{top: number; left: number} | null>(null);
  const signature = items.map(item => `${item.id}:${item.label}:${Boolean(item.disabled)}`).join("|");
  useLayoutEffect(() => {
    const menu = ref.current!;
    menu.showPopover?.();
    const box = menu.getBoundingClientRect(), trigger = anchor.getBoundingClientRect();
    setPosition({
      left: Math.max(12, Math.min(trigger.right - box.width, window.innerWidth - box.width - 12)),
      top: trigger.bottom + 8 + box.height <= window.innerHeight - 12
        ? trigger.bottom + 8 : Math.max(12, trigger.top - box.height - 8),
    });
    const dismiss = (event: Event) => {
      if (event.type === "scroll" && menu.contains(event.target as Node)) return;
      onClose();
    };
    const outside = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose();
    };
    const toggled = (event: Event) => {
      if ((event as Event & {newState?: string}).newState === "closed") onClose();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    menu.addEventListener("toggle", toggled);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      menu.removeEventListener("toggle", toggled);
      menu.hidePopover?.();
    };
  }, [anchor, onClose, signature]);
  useLayoutEffect(() => {
    if (position) ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({preventScroll: true});
  }, [position]);
  return createPortal(<div ref={ref} popover="auto" role="menu" aria-label={title} lang={language}
    className={s.menu} style={{...position, visibility: position ? "visible" : "hidden"}}
    onClick={event => event.stopPropagation()}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        onClose(); return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }}>
    {items.map(item => <button type="button" role="menuitem" key={item.id} disabled={item.disabled} onClick={item.onSelect}>
      {item.icon}{item.label}
    </button>)}
  </div>, anchor.closest("dialog") || anchor.closest("[data-practice-palette]") || document.body);
}
