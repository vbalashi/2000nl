"use client";
import React from "react";
import { mapInterfaceCatalogs } from "@/lib/i18n/catalog";
import { getUiMessages } from "@/lib/uiMessages";
import { Check, ChevronDown, ChevronUp, EyeOff } from "lucide-react";
import { ActionMenu } from "@/components/practice/ui/ActionMenu";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { senseCardQuietAction } from "../SenseCardChrome";
/** Compatibility adapter; exclusion and undo copy has one catalog owner. */
export const trainingExclusionCopy = mapInterfaceCatalogs(catalog => catalog.ui.trainingSession.exclusion);
export function TrainingExcludeAction({
  language,
  disabled,
  onClick,
  knownAction,
  onChooseKnown,
  buttonRef,
  scope = "pair",
}: {
  onChooseKnown?: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement>;
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
  React.useImperativeHandle(buttonRef,()=>trigger.current!,[]);
  const close = React.useCallback(() => {
    setAnchor(null);
    trigger.current?.focus({ preventScroll: true });
  }, []);
  return (<>

    <button
      ref={trigger}
      type="button"
      className={`${senseCardQuietAction()} min-w-0 max-w-full whitespace-normal`}
      disabled={disabled}
      onClick={event => onChooseKnown ? onChooseKnown() : anchor ? close() : setAnchor(event.currentTarget)}
      aria-haspopup={onChooseKnown ? undefined : "menu"}
      aria-expanded={onChooseKnown ? undefined : Boolean(anchor)}
      title={onChooseKnown ? getUiMessages(language).trainingSession.knownChoice.choiceLabel : t.help}
      aria-label={onChooseKnown ? getUiMessages(language).trainingSession.knownChoice.markKnown : t.help}
    >
      {onChooseKnown ? <Check size={16} className="shrink-0" aria-hidden="true" /> : <EyeOff size={16} className="shrink-0" aria-hidden="true" />}
      <span className="min-w-0 break-words text-left">{onChooseKnown ? getUiMessages(language).trainingSession.knownChoice.markKnown : t.label}</span>
      {!onChooseKnown && (anchor
        ? <ChevronUp size={14} className="shrink-0" aria-hidden="true" />
        : <ChevronDown size={14} className="shrink-0" aria-hidden="true" />)}
    </button>
    {anchor ? <ActionMenu
      anchor={anchor} language={language} title={getUiMessages(language).cardActions.title}
      onClose={close} items={[
        { id: "exclude", label: t.label, description: t.help, icon: <EyeOff size={15} aria-hidden="true" />,
          disabled, onSelect: () => { close(); onClick(); } },
        ...(knownAction ? [{ id: "known", label: knownAction.label, description: getUiMessages(language).cardActions.knownHelp, icon: <Check size={15} aria-hidden="true" />,
          disabled, onSelect: () => { close(); knownAction.onClick(); } }] : []),
      ]} /> : null}
    </>);

}
