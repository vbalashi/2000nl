"use client";
import React, { useId, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";
import { DialogSurface } from "@/components/practice/ui/DialogSurface";
import s from "./statistics.module.css";

export type StatisticsChoice = { id: string; label: string; short?: string; description?: string };
const VISIBLE = 3;

/** Learning-language scope for Statistics; overflow languages live in a native select. */
export function StatisticsLanguageTabs({ interfaceLanguage, languages, value, onChange }: {
  interfaceLanguage: OnboardingLanguage; languages: StatisticsChoice[]; value: string; onChange: (id: string) => void;
}) {
  const copy = getUiMessages(interfaceLanguage).statistics;
  if (languages.length === 1) return <div className={s.languageRow}><span className={s.singleLanguage} aria-label={copy.learningLanguage}>{languages[0].label}</span></div>;
  const rest = languages.slice(VISIBLE);
  const selectedRest = rest.find(item => item.id === value);
  return <div className={s.languageRow}><div className={s.choiceTabs} role="group" aria-label={copy.learningLanguage}>
    {languages.slice(0, VISIBLE).map(item => <button key={item.id} type="button" aria-pressed={value === item.id} onClick={() => onChange(item.id)}>{item.label}</button>)}
    {rest.length > 0 && <label className={s.moreLanguage} data-active={Boolean(selectedRest)}>
      <span>{selectedRest?.label ?? copy.more}</span><ChevronDown size={12} aria-hidden="true" />
      <select aria-label={copy.moreLanguages} value={selectedRest?.id ?? ""} onChange={event => onChange(event.target.value)}>
        <option value="" disabled>{copy.otherLanguages}</option>
        {rest.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>}
  </div></div>;
}

/** Material scope chips with a dialog listing every material of the language. */
export function StatisticsMaterialPicker({ interfaceLanguage, languageLabel, options, value, onChange }: {
  interfaceLanguage: OnboardingLanguage; languageLabel: string; options: StatisticsChoice[]; value: string; onChange: (id: string) => void;
}) {
  const copy = getUiMessages(interfaceLanguage).statistics;
  const [open, setOpen] = useState(false);
  const titleId = useId();
  return <div className={s.materialScopes} role="group" aria-label={copy.material}>
    <h2 className={s.materialTitle}>{copy.yourMaterial}</h2><p className={s.materialHint}>{copy.materialHint}</p>
    <div className={s.choiceTabs}>
      {options.slice(0, VISIBLE).map(item => <button key={item.id} type="button" aria-pressed={value === item.id} onClick={() => onChange(item.id)}>{item.short ?? item.label}</button>)}
      {options.length > 1 && <button type="button" className={s.scopeMore} aria-label={copy.chooseTrainingMaterial} aria-haspopup="dialog" onClick={() => setOpen(true)}><ChevronDown size={14} aria-hidden="true" /></button>}
    </div>
    {open && <DialogSurface onDismiss={() => setOpen(false)} className={s.scopeDialog} aria-labelledby={titleId}><div className={s.dialogInner}>
      <div className={s.dialogHeading}><h2 id={titleId}>{copy.chooseMaterial}</h2><button type="button" aria-label={copy.closeSelection} onClick={() => setOpen(false)}><X size={18} aria-hidden="true" /></button></div>
      <p className={s.dialogHint}>{languageLabel} · {copy.learningMaterial}</p>
      <div className={s.scopeOptions}>{options.map(item => <button key={item.id} type="button" aria-pressed={value === item.id} onClick={() => { onChange(item.id); setOpen(false); }}>
        <span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span>{value === item.id && <Check size={17} aria-hidden="true" />}
      </button>)}</div>
    </div></DialogSurface>}
  </div>;
}
