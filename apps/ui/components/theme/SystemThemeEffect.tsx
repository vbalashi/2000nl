"use client";
import { useEffect } from "react";
import { applyResolvedTheme } from "@/lib/preferences/resolvedTheme";
/** System fallback respects the account controller while it is mounted. */
export function SystemThemeEffect() {
  useEffect(() => {
    const root = document.documentElement,
      media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyResolvedTheme(root, media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return null;
}
