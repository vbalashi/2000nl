"use client";

import {useEffect, useState} from "react";
import {isPracticePalette, type PracticeColourMode, type PracticePalette} from "./appearance";

type Appearance = {palette: PracticePalette; mode: PracticeColourMode};
const defaultAppearance: Appearance = {palette: "lavender", mode: "Light"};
const isMode = (value: unknown): value is PracticeColourMode =>
  value === "Light" || value === "Dark" || value === "System";

/** Optional local preferences; no account writes or app-global side effects. */
export function usePracticeAppearance(storageKey?: string) {
  const [appearance, setAppearance] = useState<Appearance>(defaultAppearance);
  const [loadedKey, setLoadedKey] = useState<string | undefined | null>(null);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemDark(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let next = defaultAppearance;
    if (storageKey) {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (stored && isPracticePalette(stored.palette) && isMode(stored.mode)) {
          next = {palette: stored.palette, mode: stored.mode};
        }
      } catch {
        // Unavailable or obsolete preferences use defaults.
      }
    }
    setAppearance(next);
    setLoadedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    // A changed key must be read before this effect can write to it.
    if (loadedKey === storageKey && storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(appearance));
      } catch {
        // Private browsing may deny local storage.
      }
    }
  }, [appearance, loadedKey, storageKey]);

  const update = (patch: Partial<Appearance>) => setAppearance(current => ({...current, ...patch}));
  return {
    ...appearance,
    dark: appearance.mode === "Dark" || appearance.mode === "System" && systemDark,
    setPalette: (palette: PracticePalette) => update({palette}),
    setMode: (mode: PracticeColourMode) => update({mode}),
  };
}
