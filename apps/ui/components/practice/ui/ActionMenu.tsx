"use client";

import React, { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import s from "../library/libraryOverlays.module.css";

export type ActionMenuItem = {
  id: string;
  label: string;
  description?: string;
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
  const descriptionId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{top: number; left: number} | null>(null);
  const onCloseRef = useRef(onClose);
  const focused = useRef(false);
  const lastFocusedItem = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const signature = items.map(item => `${item.id}:${item.label}:${item.description ?? ""}`).join("|");
  useLayoutEffect(() => {
    const menu = ref.current!;
    focused.current = false;
    lastFocusedItem.current = null;
    menu.showPopover?.();
    const dismiss = (event: Event) => {
      if (event.type === "scroll" && menu.contains(event.target as Node)) return;
      onCloseRef.current();
    };
    const outside = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node) && !anchor.contains(event.target as Node)) onCloseRef.current();
    };
    const toggled = (event: Event) => {
      if ((event as Event & {newState?: string}).newState === "closed") onCloseRef.current();
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
  }, [anchor]);
  // Updating action availability must not hide/reopen the native popover.
  // Only changes to its content require a fresh geometry measurement.
  useLayoutEffect(() => {
    const menu = ref.current!;
    const box = menu.getBoundingClientRect(), trigger = anchor.getBoundingClientRect();
    setPosition({
      left: Math.max(12, Math.min(trigger.right - box.width, window.innerWidth - box.width - 12)),
      top: trigger.bottom + 8 + box.height <= window.innerHeight - 12
        ? trigger.bottom + 8 : Math.max(12, trigger.top - box.height - 8),
    });
  }, [anchor, signature]);
  useLayoutEffect(() => {
    if (position && !focused.current) {
      const first = ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
      if (first) { first.focus({preventScroll: true}); focused.current = true; }
    }
  }, [position]);
  // Native disabling blurs a menu item. Restore that same item after a brief
  // authority fence, without moving focus away from another active control.
  const availability = items.map(item => `${item.id}:${Boolean(item.disabled)}`).join("|");
  useLayoutEffect(() => {
    const item = lastFocusedItem.current;
    if (item?.isConnected && !item.disabled && document.activeElement === document.body) {
      item.focus({preventScroll: true});
    }
  }, [availability]);
  return createPortal(<div ref={ref} popover="auto" role="menu" aria-label={title} lang={language}
    className={s.menu} style={{...position, visibility: position ? "visible" : "hidden"}}
    onClick={event => event.stopPropagation()}
    onFocusCapture={event => {
      if (event.target instanceof HTMLButtonElement) lastFocusedItem.current = event.target;
    }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        onCloseRef.current(); return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }}>
    {items.map(item => <button type="button" role="menuitem" key={item.id} disabled={item.disabled} aria-label={item.label} aria-describedby={item.description ? `${descriptionId}-${item.id}` : undefined} onClick={item.onSelect}>
      {item.icon}<span className={s.menuCopy}>{item.label}{item.description && <span id={`${descriptionId}-${item.id}`} className={s.menuDescription}>{item.description}</span>}</span>
    </button>)}
  </div>, anchor.closest("dialog") || anchor.closest("[data-practice-palette]") || document.body);
}
