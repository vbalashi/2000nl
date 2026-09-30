"use client";

import React, {forwardRef, useEffect, useImperativeHandle, useRef, type DialogHTMLAttributes} from "react";

let scrollLocks = 0;
let previousOverflow = "";

/** Native top-layer modal; deliberately stays in the themed DOM subtree. */
export const DialogSurface = forwardRef<HTMLDialogElement, Omit<DialogHTMLAttributes<HTMLDialogElement>, "open" | "onClose"> & {
  onDismiss: () => void;
}>(function DialogSurface({onDismiss, onCancel, onClick, children, ...props}, forwardedRef) {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture before descendant autoFocus runs during commit, not after it has
  // moved focus into the dialog. Restoration must target the actual opener.
  const openerRef = useRef<HTMLElement | null>(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useImperativeHandle(forwardedRef, () => ref.current!);
  useEffect(() => {
    const dialog = ref.current!;
    const opener = openerRef.current;
    if (!scrollLocks++) {
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
    }
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (!--scrollLocks) document.documentElement.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({preventScroll: true});
    };
  }, []);
  return <dialog {...props} ref={ref} onCancel={event => {
    event.preventDefault();
    event.stopPropagation();
    if (onCancel) onCancel(event); else onDismiss();
  }} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onDismiss();
  }}>{children}</dialog>;
});
