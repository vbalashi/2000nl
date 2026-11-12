import React from "react";

/** Decorative: the adjacent text announces the failure. */
export function FailureIcon({kind = "alert", className}: {kind?: "alert" | "cloud"; className?: string}) {
  return <span className={className} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {kind === "cloud" ? <><path d="M7 17H6a4 4 0 0 1-.2-8A6 6 0 0 1 17 8a4.5 4.5 0 0 1 1 9h-1"/><path d="m9 14 6 6m0-6-6 6"/></> : <><path d="M12 7v6"/><path d="M12 17h.01"/></>}
  </svg></span>;
}
