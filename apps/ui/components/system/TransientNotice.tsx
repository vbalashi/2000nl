"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
  tone: "error" | "info" | "success";
  dismissLabel: string;
  onDismiss: () => void;
  action?: React.ReactNode;
  className?: string;
};

const toneClass = {
  error: "border-rose-400/60 bg-[#261b22] text-rose-100",
  info: "border-slate-400/60 bg-slate-900 text-slate-50",
  success: "border-emerald-400/60 bg-[#17251f] text-emerald-100",
} as const;

export function TransientNotice({
  children,
  tone,
  dismissLabel,
  onDismiss,
  action,
  className = "",
}: Props) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-2 text-sm shadow-xl ${toneClass[tone]} ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="min-w-0">{children}</span>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <button
            type="button"
            aria-label={dismissLabel}
            onClick={onDismiss}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl leading-none text-current opacity-80 hover:bg-white/10 hover:opacity-100"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
