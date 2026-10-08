import React from "react";
import type { useResizableSheet } from "./useResizableSheet";
import s from "./sheetHandle.module.css";
export function SheetHandle({
  controller,
  label,
}: {
  controller: ReturnType<typeof useResizableSheet>;
  label: string;
}) {
  return (
    <button
      type="button"
      className={s.handle}
      aria-label={label}
      aria-expanded={controller.expanded}
      aria-keyshortcuts="ArrowUp ArrowDown Home End"
      {...controller.handleProps}
    >
      <span aria-hidden="true" />
    </button>
  );
}
