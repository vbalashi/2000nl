"use client";
import {useEffect, useState} from "react";
import {detectReadingDevice, type ReadingDevice} from "@/lib/reading/readingSize";
import {normalizeTextSize, type TextSize} from "@/lib/reading/textScale";
const key = "2000nl-preview-text-size-v1";
type Preferences = Record<ReadingDevice, TextSize>;
/** Local preview adapter; never writes unsupported values to account settings. */
export function usePreviewTextSize() {
  const [preferences, setPreferences] = useState<Preferences>({phone:"standard", desktop:"standard"});
  const [device, setDevice] = useState<ReadingDevice>("desktop");
  const [ready, setReady] = useState(false);
  const [stored, setStored] = useState(true);
  useEffect(() => {
    setDevice(detectReadingDevice(navigator));
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved) setPreferences({phone:normalizeTextSize(saved.phone), desktop:normalizeTextSize(saved.desktop)});
    } catch { setStored(false); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(key, JSON.stringify(preferences)); setStored(true); }
    catch { setStored(false); }
  }, [preferences, ready]);
  return {size:preferences[device], device, ready, stored,
    setSize:(size:TextSize) => setPreferences(current => ({...current, [device]:size}))};
}
