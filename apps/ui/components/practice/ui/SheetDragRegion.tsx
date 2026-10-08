"use client";
import React from "react";
import type { useResizableSheet } from "./useResizableSheet";
import s from "./sheetHandle.module.css";
type Controller = ReturnType<typeof useResizableSheet>;
const Context = React.createContext<Controller | null>(null);
export const SheetDragProvider = Context.Provider;
/** Only stationary chrome drags; controls and the independent scroll body keep their own gestures. */
export function SheetDragRegion({
  controller: supplied,
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  controller?: Controller;
  children: React.ReactNode;
}) {
  const inherited = React.useContext(Context);
  const controller = supplied ?? inherited;
  const gestures: React.HTMLAttributes<HTMLElement> = controller
    ? {
        onPointerDown: controller.handleProps.onPointerDown,
        onPointerMove: controller.handleProps.onPointerMove,
        onPointerUp: controller.handleProps.onPointerUp,
        onPointerCancel: controller.handleProps.onPointerCancel,
        onLostPointerCapture: controller.handleProps.onLostPointerCapture,
      }
    : {};
  return (
    <header
      {...props}
      {...gestures}
      className={`${className ?? ""} ${controller ? s.dragRegion : ""}`}
      onPointerDown={(event) => {
        if (
          (event.target as Element).closest(
            "button,a,input,select,textarea,summary,[role=button]",
          )
        )
          return;
        gestures.onPointerDown?.(event);
      }}
    >
      {children}
    </header>
  );
}
