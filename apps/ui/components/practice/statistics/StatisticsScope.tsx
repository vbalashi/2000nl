"use client";
import React, { useId, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";
import {LanguageScopeControl} from "../ui/LanguageScopeControl";
import {SegmentedControl} from "../ui/SegmentedControl";
import { DialogSurface } from "@/components/practice/ui/DialogSurface";
import s from "./statistics.module.css";

export type StatisticsChoice = { id: string; label: string; short?: string; description?: string; group?: string };
const VISIBLE = 3;

/** Ordered active languages with a remembered overflow choice. */
export function StatisticsLanguageTabs({ interfaceLanguage, languages, value, onChange }: {
  interfaceLanguage: OnboardingLanguage; languages: StatisticsChoice[]; value: string; onChange: (id: string) => void;
}) {
  const copy = getUiMessages(interfaceLanguage).statistics;
  return <div className={s.languageRow}><LanguageScopeControl label={copy.learningLanguage} menuLabel={copy.moreLanguages} language={interfaceLanguage} options={languages} value={value} onChange={onChange}/></div>;
}

/** Material scope chips with a dialog listing every material of the language. */
export function StatisticsMaterialPicker({ interfaceLanguage, languageLabel, options, value, onChange, compact=false }: {
  compact?:boolean;
  interfaceLanguage: OnboardingLanguage; languageLabel: string; options: StatisticsChoice[]; value: string; onChange: (id: string) => void;
}) {
  const copy = getUiMessages(interfaceLanguage).statistics;
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const [remembered,setRemembered]=useState<string|null>(null);
  const specific=options.filter(item=>item.id!=="all");
  const menuOptions=compact?specific:options;
  const rememberedOption=specific.find(item=>item.id===value)??specific.find(item=>item.id===remembered)??specific[0];
  return <div className={s.materialScopes} role="group" aria-label={copy.material}>
    <h2 className={s.materialTitle}>{copy.yourMaterial}</h2><p className={s.materialHint}>{copy.materialHint}</p>
    <SegmentedControl standard label={copy.material}>
      {compact?<>
        <button type="button" aria-pressed={value==="all"} onClick={()=>onChange("all")}>{copy.all}</button>
        <button type="button" className={s.materialChoice} title={rememberedOption?.label} aria-pressed={Boolean(rememberedOption&&value===rememberedOption.id)} onClick={()=>rememberedOption?onChange(rememberedOption.id):setOpen(true)}>{rememberedOption?.short??rememberedOption?.label??copy.chooseMaterial}</button>
      </>:options.slice(0, VISIBLE).map(item => <button key={item.id} type="button" aria-pressed={value === item.id} onClick={() => onChange(item.id)}>{item.short ?? item.label}</button>)}
      {options.length > 1 && <button type="button" className={s.scopeMore} aria-label={copy.chooseTrainingMaterial} aria-haspopup="dialog" onClick={() => setOpen(true)}><ChevronDown size={14} aria-hidden="true" /></button>}
    </SegmentedControl>
    {open && <DialogSurface onDismiss={() => setOpen(false)} className={s.scopeDialog} aria-labelledby={titleId}><div className={s.dialogInner}>
      <div className={s.dialogHeading}><h2 id={titleId}>{copy.chooseMaterial}</h2><button type="button" aria-label={copy.closeSelection} onClick={() => setOpen(false)}><X size={18} aria-hidden="true" /></button></div>
      <p className={s.dialogHint}>{languageLabel} · {copy.learningMaterial}</p>
      <div className={s.scopeOptions}>{menuOptions.map((item,index) => <React.Fragment key={item.id}>{item.group && item.group !== menuOptions[index-1]?.group && <h3 className={s.scopeGroup}>{item.group}</h3>}<button key={item.id} type="button" aria-pressed={value === item.id} onClick={() => {setRemembered(item.id); onChange(item.id); setOpen(false); }}>
        <span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span>{value === item.id && <Check size={17} aria-hidden="true" />}
      </button></React.Fragment>)}</div>
    </div></DialogSurface>}
  </div>;
}
