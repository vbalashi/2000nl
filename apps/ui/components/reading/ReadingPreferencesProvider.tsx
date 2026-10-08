"use client";

import React from "react";
import {accountTextSize,accountTextSizeStyles} from "@/lib/reading/textScale";
import { defaultReadingPreferences, detectReadingDevice, readingSizeStyles, type ReadingDevice, type ReadingPreferences, type ReadingSize } from "@/lib/reading/readingSize";
import { readingPreferencesRepository, type ReadingPreferencesRepository } from "@/lib/reading/readingPreferencesRepository";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type ReadingSettings = {
  preferences: ReadingPreferences;
  device: ReadingDevice;
  loadStatus: "loading" | "ready" | "error";
  saveStatus: Record<ReadingDevice, SaveStatus>;
  save: (device: ReadingDevice, size: ReadingSize) => Promise<void>;
  reload: () => void;
};
const Context = React.createContext<ReadingSettings | null>(null);

export function useReadingSettings() { return React.useContext(Context); }

export function ReadingPreferencesProvider(props: {
  userId: string;
  repository?: ReadingPreferencesRepository;
  children: React.ReactNode;
}) {
  return <ReadingSession key={props.userId} {...props} />;
}

function ReadingSession({ userId, repository = readingPreferencesRepository, children }: {
  userId: string;
  repository?: ReadingPreferencesRepository;
  children: React.ReactNode;
}) {
  const [preferences, setPreferences] = React.useState<ReadingPreferences>(defaultReadingPreferences);
  const [device, updateDevice] = React.useState<ReadingDevice>("desktop");
  const [loadStatus, setLoadStatus] = React.useState<ReadingSettings["loadStatus"]>("loading");
  const [saveStatus, setSaveStatus] = React.useState<ReadingSettings["saveStatus"]>({ phone: "idle", desktop: "idle" });
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const alive = React.useRef(false);
  const pending = React.useRef({ phone: false, desktop: false });

  React.useEffect(() => {
    let selected = detectReadingDevice(navigator);
    updateDevice(selected);
  }, []);

  React.useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoadStatus("loading");
    void repository.load(userId).then((loaded) => {
      if (cancelled) return;
      setPreferences(loaded);
      setLoadStatus("ready");
    }).catch(() => { if (!cancelled) setLoadStatus("error"); });
    return () => { cancelled = true; };
  }, [userId, repository, loadAttempt]);

  const save = async (profile: ReadingDevice, size: ReadingSize) => {
    if (loadStatus !== "ready" || pending.current[profile]) return;
    pending.current[profile] = true;
    setPreferences((current) => ({ ...current, [profile]: size }));
    setSaveStatus((current) => ({ ...current, [profile]: "saving" }));
    try {
      await repository.save(userId, profile, size);
      if (alive.current) setSaveStatus((current) => ({ ...current, [profile]: "saved" }));
    } catch {
      if (alive.current) setSaveStatus((current) => ({ ...current, [profile]: "error" }));
    } finally { pending.current[profile] = false; }
  };

  return <Context.Provider value={{ preferences, device, loadStatus, saveStatus, save, reload: () => setLoadAttempt((n) => n + 1) }}>
    <div className="contents" data-reading-device={device} data-reading-size={preferences[device]} data-text-size={accountTextSize[preferences[device]]} style={{...readingSizeStyles[preferences[device]], ...accountTextSizeStyles(preferences[device])}}>
      {children}
    </div>
  </Context.Provider>;
}
