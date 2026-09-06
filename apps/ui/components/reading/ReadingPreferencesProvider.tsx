"use client";

import React from "react";
import { defaultReadingPreferences, detectReadingDevice, readingSizeStyles, type ReadingDevice, type ReadingPreferences, type ReadingSize } from "@/lib/reading/readingSize";
import { readingPreferencesRepository, type ReadingPreferencesRepository } from "@/lib/reading/readingPreferencesRepository";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type ReadingSettings = {
  preferences: ReadingPreferences;
  device: ReadingDevice;
  deviceStored: boolean;
  loadStatus: "loading" | "ready" | "error";
  saveStatus: Record<ReadingDevice, SaveStatus>;
  setDevice: (device: ReadingDevice) => void;
  save: (device: ReadingDevice, size: ReadingSize) => Promise<void>;
  reload: () => void;
};
const Context = React.createContext<ReadingSettings | null>(null);
const deviceKey = "2000nl.reading-device.v1";

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
  const [deviceStored, setDeviceStored] = React.useState(true);
  const [loadStatus, setLoadStatus] = React.useState<ReadingSettings["loadStatus"]>("loading");
  const [saveStatus, setSaveStatus] = React.useState<ReadingSettings["saveStatus"]>({ phone: "idle", desktop: "idle" });
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const alive = React.useRef(false);
  const pending = React.useRef({ phone: false, desktop: false });

  React.useEffect(() => {
    let selected = detectReadingDevice(navigator);
    try {
      const stored = window.localStorage.getItem(deviceKey);
      if (stored === "phone" || stored === "desktop") selected = stored;
    } catch { setDeviceStored(false); }
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

  const setDevice = (next: ReadingDevice) => {
    updateDevice(next);
    try { window.localStorage.setItem(deviceKey, next); setDeviceStored(true); }
    catch { setDeviceStored(false); }
  };
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

  return <Context.Provider value={{ preferences, device, deviceStored, loadStatus, saveStatus, setDevice, save, reload: () => setLoadAttempt((n) => n + 1) }}>
    <div className="contents" data-reading-device={device} data-reading-size={preferences[device]} style={readingSizeStyles[preferences[device]]}>
      {children}
    </div>
  </Context.Provider>;
}
