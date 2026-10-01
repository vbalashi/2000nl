"use client";
import React from "react";
import {
  LearningMaterialSettings,
  DictionaryMaterialSettings,
} from "@/components/practice/material/MaterialSettings";
import { languageDisplayName } from "@/lib/languages/languageDisplayName";
import { Languages, Palette, Keyboard, UserRound, Library } from "lucide-react";
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
const TranslationLanguagePicker = React.lazy(() =>
  import("@/components/practice/settings/LanguagePicker").then((module) => ({
    default: module.LanguagePicker,
  })),
);
/** Account preference callbacks remain owned by the production controller. */
export function ApprovedSettingsDestination(props: SettingsDestinationProps) {
  const copy = getUiMessages(props.interfaceLanguage).settings;
  const sections = [
    { id: "languages", label: copy.languages, Icon: Languages },
    { id: "dictionaries", label: copy.dictionaries, Icon: Library },
    { id: "appearance", label: copy.appearance, Icon: Palette },
    { id: "shortcuts", label: copy.shortcuts, Icon: Keyboard },
    { id: "account", label: copy.account, Icon: UserRound },
  ] as const;
  const [pickerOpen, setPickerOpen] = React.useState(false);
  React.useEffect(() => {
    if (!props.open) setPickerOpen(false);
  }, [props.open]);
  const translationOff =
    !props.translationLanguage || props.translationLanguage === "off";
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
            <>
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
                <SettingsRow
                  title={copy.translationLanguage}
                >
                  <div className={s.options}>
                    <button
                      type="button"
                      aria-pressed={translationOff}
                      onClick={() => props.onTranslationLanguageChange(null)}
                    >
                      {copy.off}
                    </button>
                    <button
                      type="button"
                      aria-label={copy.translationLanguage}
                      aria-haspopup="dialog"
                      aria-expanded={pickerOpen}
                      onClick={() => setPickerOpen(true)}
                    >
                      {translationOff
                        ? copy.chooseLanguage
                        : languageDisplayName(
                            props.interfaceLanguage,
                            props.translationLanguage!,
                          )}{" "}
                    </button>
                  </div>
                </SettingsRow>
              </SettingsPanel>
              <LearningMaterialSettings language={props.interfaceLanguage} />
              {pickerOpen && (
                <React.Suspense
                  fallback={
                    <p role="status">
                      {
                        getUiMessages(props.interfaceLanguage).languagePicker
                          .loading
                      }
                    </p>
                  }
                >
                  <TranslationLanguagePicker
                    title={copy.translationLanguage}
                    language={props.interfaceLanguage}
                    selectedCode={
                      translationOff ? null : props.translationLanguage
                    }
                    onChoose={(item) =>
                      props.onTranslationLanguageChange(item.code)
                    }
                    onClose={() => setPickerOpen(false)}
                  />
                </React.Suspense>
              )}
            </>
          );
        if (section === "dictionaries")
          return (
            <DictionaryMaterialSettings language={props.interfaceLanguage} />
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
