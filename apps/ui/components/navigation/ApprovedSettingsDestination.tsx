"use client";
import React from "react";
import { Languages, Palette, Keyboard, UserRound } from "lucide-react";
import { getUiMessages } from "@/lib/uiMessages";
import { getTrainingHotkeys } from "@/components/training/trainingHotkeys";
import {
  SettingsLayout,
  SettingsPanel,
  SettingsRow,
} from "@/components/practice/settings/SettingsLayout";
import { ApprovedAppearanceSection } from "@/components/practice/ui/ApprovedAppearanceSection";
import { ApprovedTextSizeSection } from "@/components/reading/ApprovedTextSizeSection";
import type { SettingsDestinationProps } from "./SettingsDestination";
import s from "@/components/practice/settings/settings.module.css";
const interfaceLanguages = [
  { code: "en", name: "English" },
  { code: "nl", name: "Nederlands" },
  { code: "ru", name: "Русский" },
] as const;
/** Account preference callbacks remain owned by the production controller. */
export function ApprovedSettingsDestination(props: SettingsDestinationProps) {
  const copy = getUiMessages(props.interfaceLanguage).settings;
  const sections = [
    { id: "languages", label: copy.languages, Icon: Languages },
    { id: "appearance", label: copy.appearance, Icon: Palette },
    { id: "shortcuts", label: copy.shortcuts, Icon: Keyboard },
    { id: "account", label: copy.account, Icon: UserRound },
  ] as const;
  const extraTranslation =
    props.translationLanguage &&
    !interfaceLanguages.some((item) => item.code === props.translationLanguage)
      ? props.translationLanguage
      : null;
  const languageName = (code: string) => {
    try {
      return (
        new Intl.DisplayNames([props.interfaceLanguage], {
          type: "language",
        }).of(code) ?? code
      );
    } catch {
      return code;
    }
  };
  return (
    <SettingsLayout
      active={props.open}
      language={props.interfaceLanguage}
      items={[...sections]}
      onExit={props.onExit}
    >
      {(section) => {
        if (section === "languages")
          return (
            <SettingsPanel title={copy.languages}>
              <SettingsRow title={copy.interfaceLanguage}>
                <select
                  className={s.select}
                  aria-label={copy.interfaceLanguage}
                  value={props.interfaceLanguage}
                  onChange={(event) =>
                    void props.onInterfaceLanguageChange(
                      event.target.value as typeof props.interfaceLanguage,
                    )
                  }
                >
                  {interfaceLanguages.map(({ code, name }) => (
                    <option key={code} value={code} lang={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </SettingsRow>
              <SettingsRow title={copy.translationLanguage}>
                <select
                  className={s.select}
                  aria-label={copy.translationLanguage}
                  value={props.translationLanguage ?? "off"}
                  onChange={(event) =>
                    props.onTranslationLanguageChange(
                      event.target.value === "off" ? null : event.target.value,
                    )
                  }
                >
                  <option value="off">{copy.off}</option>
                  {interfaceLanguages.map(({ code, name }) => (
                    <option key={code} value={code} lang={code}>
                      {name}
                    </option>
                  ))}
                  {extraTranslation && (
                    <option value={extraTranslation}>
                      {languageName(extraTranslation)}
                    </option>
                  )}
                </select>
              </SettingsRow>
            </SettingsPanel>
          );
        if (section === "appearance")
          return (
            <>
              <ApprovedAppearanceSection
                language={props.interfaceLanguage}
                mode={props.themePreference}
                onModeChange={props.onThemeChange}
                embedded
              />
              <ApprovedTextSizeSection
                language={props.interfaceLanguage}
                embedded
              />
            </>
          );
        if (section === "shortcuts")
          return (
            <SettingsPanel title={copy.trainingShortcuts}>
              <p className={s.hint}>{copy.shortcutsHint}</p>
              <div className={s.shortcuts}>
                {getTrainingHotkeys(props.interfaceLanguage).map((item) => (
                  <div key={item.key}>
                    <span>{item.description}</span>
                    <kbd>{item.key}</kbd>
                  </div>
                ))}
              </div>
            </SettingsPanel>
          );
        return (
          <SettingsPanel title={copy.account}>
            <SettingsRow title={copy.profile}>
              <p className={s.email}>{props.userEmail}</p>
            </SettingsRow>
            <SettingsRow title={copy.signOut}>
              <button
                type="button"
                className={`${s.action} ${s.danger}`}
                onClick={() => void props.onSignOut()}
              >
                {copy.signOut}
              </button>
            </SettingsRow>
          </SettingsPanel>
        );
      }}
    </SettingsLayout>
  );
}
