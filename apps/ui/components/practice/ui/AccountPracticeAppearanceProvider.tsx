"use client";
import React from "react";
import { StartupStatus } from "@/components/training/pilot/StartupStatus";
import { StartupLogoScreen } from "@/components/training/pilot/StartupLogoScreen";
import startup from "@/components/training/pilot/startupLogo.module.css";
import { getUiMessages } from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  practicePaletteRepository,
  type PracticePaletteRepository,
} from "@/lib/preferences/practicePaletteRepository";
import type { PracticePalette } from "./appearance";
import theme from "./practiceTheme.module.css";
type Status = "idle" | "saving" | "saved" | "error";
type AccountAppearance = {
  palette: PracticePalette;
  loadStatus: "loading" | "ready" | "error";
  saveStatus: Status;
  save: (palette: PracticePalette) => Promise<void>;
  reload: () => void;
};
const Context = React.createContext<AccountAppearance | null>(null);
export const useAccountPracticeAppearance = () => React.useContext(Context);

/** Palette alone belongs here. The existing theme-mode and reading-profile owners remain authoritative. */
export function AccountPracticeAppearanceProvider(props: {
  userId: string;
  requireReady?: boolean;
  interfaceLanguage?: OnboardingLanguage;
  repository?: PracticePaletteRepository;
  children: React.ReactNode;
}) {
  if (process.env.NEXT_PUBLIC_TRAINING_PRESENTATION_V1 !== "true")
    return <>{props.children}</>;
  return <AccountAppearanceSession key={props.userId} {...props} />;
}
function AccountAppearanceSession({
  userId,
  repository = practicePaletteRepository,
  children,
  requireReady = false,
  interfaceLanguage = "en",
}: {
  userId: string;
  requireReady?: boolean;
  interfaceLanguage?: OnboardingLanguage;
  repository?: PracticePaletteRepository;
  children: React.ReactNode;
}) {
  const [palette, setPalette] = React.useState<PracticePalette>("lavender");
  const [loadStatus, setLoadStatus] =
    React.useState<AccountAppearance["loadStatus"]>("loading");
  const [saveStatus, setSaveStatus] = React.useState<Status>("idle");
  const [attempt, setAttempt] = React.useState(0);
  const alive = React.useRef(false),
    pending = React.useRef(false);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  React.useEffect(() => {
    let cancelled = false;
    setLoadStatus("loading");
    void repository
      .load(userId)
      .then((value) => {
        if (!cancelled) {
          setPalette(value);
          setLoadStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [repository, userId, attempt]);
  const save = async (value: PracticePalette) => {
    if (loadStatus !== "ready" || pending.current) return;
    pending.current = true;
    setPalette(value);
    setSaveStatus("saving");
    try {
      await repository.save(userId, value);
      if (alive.current) setSaveStatus("saved");
    } catch {
      if (alive.current) setSaveStatus("error");
    } finally {
      pending.current = false;
    }
  };
  if (requireReady && loadStatus !== "ready") {
    if (loadStatus !== "error") return <StartupStatus language={interfaceLanguage} />;
    const copy = getUiMessages(interfaceLanguage).appearancePreferences;
    return <StartupLogoScreen><div role={loadStatus === "error" ? "alert" : "status"}>
      <p>{loadStatus === "error" ? copy.loadError : copy.loading}</p>
      {loadStatus === "error" ? <button onClick={() => setAttempt(current => current + 1)}>{copy.retry}</button> : null}
    </div></StartupLogoScreen>;
  }
  return (
    <Context.Provider
      value={{
        palette,
        loadStatus,
        saveStatus,
        save,
        reload: () => setAttempt((current) => current + 1),
      }}
    >
      <div
        className={`${theme.theme} contents`}
        data-colour-mode="app"
        data-practice-palette={palette}
        data-account-palette={palette}
      >
        {requireReady ? <div className={startup.ready}>{children}</div> : children}
      </div>
    </Context.Provider>
  );
}
