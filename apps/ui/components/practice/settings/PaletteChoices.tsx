"use client";
import React from "react";
import type { ThemePreference } from "@/lib/training/useTrainingPreferences";
import { Check } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";
import {
  practicePalettes,
  type PracticePalette,
} from "@/components/practice/ui/appearance";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import s from "./paletteChoices.module.css";
export function PaletteChoices({
  language,
  palette,
  onChange,
  disabled = false,
  dark = false,
  mode,
}: {
  language: OnboardingLanguage;
  palette: PracticePalette;
  onChange: (palette: PracticePalette) => void;
  disabled?: boolean;
  dark?: boolean;
  mode?: ThemePreference;
}) {
  const [systemDark,setSystemDark] = React.useState(false);
  React.useEffect(()=>{
    if(mode!=="system" || !window.matchMedia) return;
    const media=window.matchMedia("(prefers-color-scheme: dark)");
    const update=()=>setSystemDark(media.matches);
    update();media.addEventListener("change",update);
    return()=>media.removeEventListener("change",update);
  },[mode]);
  const resolvedDark=mode?(mode==="dark"||(mode==="system"&&systemDark)):dark;
  const copy = getUiMessages(language).settings;
  return (
    <div className={s.choices} role="group" aria-label={copy.theme}>
      {practicePalettes.map(({ id }) => (
        <button
          type="button"
          key={id}
          aria-label={copy.themes[id]}
          aria-pressed={palette === id}
          disabled={disabled}
          onClick={() => onChange(id)}
        >
          <span
            aria-hidden="true"
            className={`${theme.theme} ${s.swatches}`}
            data-practice-palette={id}
            data-colour-mode={resolvedDark ? "dark" : "light"}
          >
            <i />
            <i />
            <i />
          </span>
          <strong>{copy.themes[id]}</strong>
          <small>
            {palette === id ? (
              <>
                <Check size={12} aria-hidden="true" />
                {copy.current}
              </>
            ) : (
              copy.select
            )}
          </small>
        </button>
      ))}
    </div>
  );
}
