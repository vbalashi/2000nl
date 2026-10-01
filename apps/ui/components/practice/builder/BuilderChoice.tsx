"use client";
import React from "react";
import s from "./builderControls.module.css";
export function BuilderChoice({
  active,
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={active}
      className={`${s.choice} ${className}`}
    >
      {children}
    </button>
  );
}
