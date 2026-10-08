"use client";
import { useEffect } from "react";
import { cacheStartupAppearance, readStartupAppearance } from "@/lib/preferences/startupAppearance";
import { applyResolvedTheme } from "@/lib/preferences/resolvedTheme";
/** System fallback respects the account controller while it is mounted. */
export function SystemThemeEffect() {
  useEffect(() => {
    const root = document.documentElement,
      media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      applyResolvedTheme(root, media.matches);
      const cached = readStartupAppearance(document.cookie);
      if (cached) cacheStartupAppearance(cached.palette);
    };
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ["data-account-theme-mode"] });
    apply();
    media.addEventListener("change", apply);
    return () => { observer.disconnect(); media.removeEventListener("change", apply); };
  }, []);
  return null;
}
