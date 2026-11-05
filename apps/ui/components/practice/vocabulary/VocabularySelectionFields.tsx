"use client";
import { localizedSection } from "@/lib/i18n/catalog";
import { formatUiCount } from "@/lib/uiMessages";
import React, { useId, useState } from "react";
import { RangeEditor } from "./RangeEditor";
import { Pencil } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { MEANING_LIMIT_STEPS, type VocabularySelection } from "@/lib/vocabulary/selection";
import { BuilderChoice } from "../builder/BuilderChoice";
import { SegmentedControl } from "../ui/SegmentedControl";
import { IconAction } from "../ui/IconAction";
import { SettingsHelp } from "../settings/SettingsHelp";
import controls from "../builder/builderControls.module.css";
import builder from "@/components/training/pilot/approvedTrainingBuilder.module.css";
import s from "./vocabularySelection.module.css";

const copy = localizedSection("vocabularySelection");
export function VocabularySelectionFields({ value, onChange, language, section="all", showSelectionHeading=true }: { showSelectionHeading?:boolean; section?:"all"|"selection"|"meanings"; value: VocabularySelection; onChange:(next:VocabularySelection)=>void; language:OnboardingLanguage }) {
  const id=useId(), t=copy[language];
  const [rangeEdit,setRangeEdit]=useState<{from:string;to:string}|null>(null);
  const update=(patch:Partial<VocabularySelection>)=>onChange({...value,...patch});
  const selected=value.meanings==="all"?t.allMeanings:value.meanings===1?t.firstMeaning:formatUiCount(language,value.meanings,t,"firstMeanings");
  const rangeLabel=`${value.from.toLocaleString(language)}–${value.to.toLocaleString(language)}`;
  return <div className={s.fields}>
    {section!=="meanings"&&<><div className={builder.field}>
      {showSelectionHeading&&<h2 className={s.heading}>{t.selection}<SettingsHelp label={t.selection} text={t.selectionHelp}/></h2>}
      <SegmentedControl standard label={t.selection}><BuilderChoice active={value.mode==="all"} onClick={()=>update({mode:"all"})}>{t.allWords}</BuilderChoice><BuilderChoice active={value.mode==="frequency"} onClick={()=>update({mode:"frequency"})}>{t.frequency}</BuilderChoice></SegmentedControl>
    </div>
    {value.mode==="frequency"&&<div className={s.frequencyDetails}>
      <div className={builder.field}>
        <h2 className={s.heading}>{t.speech}<SettingsHelp label={t.speech} text={t.speechHelp}/></h2>
        <SegmentedControl standard label={t.speech}><BuilderChoice active={value.profile==="spoken"} onClick={()=>update({profile:"spoken"})}>{t.spoken}</BuilderChoice><BuilderChoice active={value.profile==="written"} onClick={()=>update({profile:"written"})}>{t.written}</BuilderChoice></SegmentedControl>
      </div>
      <div className={controls.rangeGroup}>
        <div className={controls.labelRow}>
          <div className={s.heading}><span className={controls.label}>{t.range}</span><SettingsHelp label={t.range} text={t.rangeHelp}/></div>
          <IconAction className={`${controls.selection} ${s.rangeValue}`} label={`${t.edit}: ${rangeLabel}`} onClick={()=>setRangeEdit({from:String(value.from),to:String(value.to)})}>{rangeLabel} <Pencil size={15} aria-hidden="true"/></IconAction>
        </div>
      </div>
    </div>}
    </>}
    {section!=="selection"&&<div className={controls.rangeGroup}>
      <div className={s.meaningHeader}><div className={s.heading}><label htmlFor={`${id}-meanings`} className={s.meaningLabel}>{t.meanings}</label><SettingsHelp label={t.meanings} text={t.meaningHelp}/></div><span className={s.meaningSelection}>{selected}</span></div>
      <div className={s.meaningTrack}>
      <input id={`${id}-meanings`} className={controls.range} type="range" min={0} max={MEANING_LIMIT_STEPS.length-1} step={1} value={MEANING_LIMIT_STEPS.indexOf(value.meanings)} aria-valuetext={selected} onChange={event=>update({meanings:MEANING_LIMIT_STEPS[Number(event.target.value)]})}/>
      <div className={`${controls.sizeTicks} ${s.ticks}`} aria-hidden="true">{MEANING_LIMIT_STEPS.map((limit,index)=><span key={limit} style={{left:`${index/(MEANING_LIMIT_STEPS.length-1)*100}%`}}>{limit==="all"?t.all:limit}</span>)}</div>
      </div>
    </div>}
    {rangeEdit&&<RangeEditor initialFrom={Number(rangeEdit.from)} initialTo={Number(rangeEdit.to)} language={language} title={t.range} onCancel={()=>setRangeEdit(null)} onApply={(from,to)=>{update({from,to});setRangeEdit(null);}}/>}
  </div>;
}

export function VocabularySelectionHelp({language}:{language:OnboardingLanguage}){return <SettingsHelp label={copy[language].selection} text={copy[language].selectionHelp}/>;}
