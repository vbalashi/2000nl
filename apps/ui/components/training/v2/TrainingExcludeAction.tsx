"use client";
import React from "react";
import { getUiMessages } from "@/lib/uiMessages";
import { Check, EyeOff } from "lucide-react";
import { ActionMenu } from "@/components/practice/ui/ActionMenu";
import { trainingPresentationV1Enabled } from "@/lib/platform/platformV2Rollout";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { senseCardQuietAction } from "../SenseCardChrome";
/** Compatibility adapter; exclusion and undo copy has one catalog owner. */
export const trainingExclusionCopy = {
  en: getUiMessages("en").trainingSession.exclusion,
  nl: getUiMessages("nl").trainingSession.exclusion,
  ru: getUiMessages("ru").trainingSession.exclusion,
};
export function TrainingExcludeAction({
  language,
  disabled,
  onClick,
  knownAction,
  scope = "pair",
}: {
  scope?: "headword" | "pair";
  language: OnboardingLanguage;
  disabled: boolean;
  onClick: () => void;
  knownAction?: { label: string; onClick: () => void };
}) {
  const copy = trainingExclusionCopy[language];
  const t = scope === "headword" ? {...copy,label:copy.headwordLabel,help:copy.headwordHelp} : copy;
  const [anchor, setAnchor] = React.useState<HTMLButtonElement | null>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const close = React.useCallback(() => {
    setAnchor(null);
    trigger.current?.focus({ preventScroll: true });
  }, []);
  const hasMenu = trainingPresentationV1Enabled() && Boolean(knownAction);
  return (<>

    <button
      ref={trigger}
      type="button"
      className={`${senseCardQuietAction()} min-w-0`}
      disabled={disabled}
      onClick={event => hasMenu ? anchor ? close() : setAnchor(event.currentTarget) : onClick()}
      aria-haspopup={hasMenu ? "menu" : undefined}
      aria-expanded={hasMenu ? Boolean(anchor) : undefined}
      title={t.help}
      aria-label={t.help}
    >
      <EyeOff size={16} className="shrink-0" aria-hidden="true" />
      <span className="break-words">{t.label}</span>
    </button>
    {anchor && hasMenu && knownAction ? <ActionMenu
      anchor={anchor} language={language} title={getUiMessages(language).cardActions.title}
      onClose={close} items={[
        { id: "exclude", label: t.label, icon: <EyeOff size={15} aria-hidden="true" />,
          disabled, onSelect: () => { close(); onClick(); } },
        { id: "known", label: knownAction.label, icon: <Check size={15} aria-hidden="true" />,
          disabled, onSelect: () => { close(); knownAction.onClick(); } },
      ]} /> : null}
    </>);

}
