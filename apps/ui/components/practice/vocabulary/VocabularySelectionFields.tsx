"use client";
import { localizedSection } from "@/lib/i18n/catalog";
import { formatUiCount, formatUiMessage } from "@/lib/uiMessages";
import React, { useId, useState } from "react";
import {FrequencyProfileIcon} from "./FrequencyProfileIcon";
import { RangeEditor } from "./RangeEditor";
import { ListOrdered, Pencil } from "lucide-react";
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
export function VocabularySelectionFields({ value, onChange, language, section="all", showSelectionHeading=true, compact=false, learningLanguage }: { learningLanguage?:string; compact?:boolean; showSelectionHeading?:boolean; section?:"all"|"selection"|"meanings"; value: VocabularySelection; onChange:(next:VocabularySelection)=>void; language:OnboardingLanguage }) {
  const id=useId(), t=copy[language];
  const [rangeEdit,setRangeEdit]=useState<{from:string;to:string}|null>(null);
  const update=(patch:Partial<VocabularySelection>)=>onChange({...value,...patch});
  const selected=value.meanings==="all"?t.allMeanings:value.meanings===1?t.firstMeaning:formatUiCount(language,value.meanings,t,"firstMeanings");
  const rangeLabel=`${value.from.toLocaleString(language)}–${value.to.toLocaleString(language)}`;
  return <div className={`${s.fields} ${compact?s.compact:""}`}>
    {section!=="meanings"&&<div className={s.selectionBlock}><div className={`${builder.field} ${compact?s.compactRow:""}`}>
      {showSelectionHeading&&<h2 className={s.heading}>{t.selection}<SettingsHelp label={t.selection} text={t.selectionHelp}/></h2>}
      <SegmentedControl standard label={t.selection}><BuilderChoice active={value.mode==="all"} onClick={()=>update({mode:"all"})}>{t.allWords}</BuilderChoice><BuilderChoice active={value.mode==="frequency"} onClick={()=>update({mode:"frequency"})}>{t.frequency}</BuilderChoice></SegmentedControl>
    </div>
    <div className={`${s.frequencyReveal} ${value.mode==="frequency"?s.frequencyRevealOpen:""}`} aria-hidden={value.mode!=="frequency"} ref={node=>{node?.toggleAttribute("inert",value.mode!=="frequency")}}><div><div className={s.frequencyDetails}>
      <div className={`${builder.field} ${compact?s.compactRow:""}`}>
        <h2 className={s.heading}>{t.speech}<SettingsHelp label={t.speech} text={learningLanguage?.toLowerCase().split("-")[0]==="nl"?t.speechHelp:t.speechGeneralHelp}/></h2>
        <SegmentedControl standard label={t.speech}><BuilderChoice active={value.profile==="spoken"} onClick={()=>update({profile:"spoken"})}>{compact?<span className={s.profileChoice}><FrequencyProfileIcon profile="spoken"/>{t.spokenShort}</span>:t.spoken}</BuilderChoice><BuilderChoice active={value.profile==="written"} onClick={()=>update({profile:"written"})}>{compact?<span className={s.profileChoice}><FrequencyProfileIcon profile="written"/>{t.writtenShort}</span>:t.written}</BuilderChoice></SegmentedControl>
      </div>
      <div className={controls.rangeGroup}>
        <div className={controls.labelRow}>
          <div className={s.heading}><span className={controls.label}>{t.range}</span><SettingsHelp label={t.range} text={compact ? [t.rangeCompactHelp,...(learningLanguage?.toLowerCase().split("-")[0]==="nl"?[t.rangeDutchSource]:[])] : t.rangeHelp}/></div>
          <IconAction className={`${controls.selection} ${s.rangeValue}`} label={`${t.edit}: ${rangeLabel}`} onClick={()=>setRangeEdit({from:String(value.from),to:String(value.to)})}>{rangeLabel} <Pencil size={15} aria-hidden="true"/></IconAction>
        </div>
        {compact&&<div className={s.quickChoices}><SegmentedControl standard label={t.range}>{[100,200,300,500,1000].map(n=><BuilderChoice key={n} active={value.from===1&&value.to===n} onClick={()=>update({from:1,to:n})}>{formatUiMessage(t.top,{count:n.toLocaleString(language)})}</BuilderChoice>)}</SegmentedControl></div>}
      </div>
    </div></div></div>
    </div>}
    {section!=="selection"&&(compact?<div className={s.compactRow}><div className={s.heading}><span className={s.meaningLabel}><ListOrdered size={15} aria-hidden="true" style={{verticalAlign:"-2px",marginInlineEnd:6}}/>{t.meanings}</span><SettingsHelp label={t.meanings} text={t.meaningHelp}/></div><SegmentedControl standard label={t.meanings}>{MEANING_LIMIT_STEPS.map(limit=><BuilderChoice key={limit} active={value.meanings==="all"?limit==="all":limit!=="all"&&limit<=value.meanings} aria-label={limit==="all"?t.allMeanings:limit===1?t.firstMeaning:formatUiCount(language,limit,t,"firstMeanings")} onClick={()=>update({meanings:limit})}>{limit==="all"?t.all:limit}</BuilderChoice>)}</SegmentedControl></div>:<div className={controls.rangeGroup}>
      <div className={s.meaningHeader}><div className={s.heading}><label htmlFor={`${id}-meanings`} className={s.meaningLabel}>{t.meanings}</label><SettingsHelp label={t.meanings} text={t.meaningHelp}/></div><span className={s.meaningSelection}>{selected}</span></div>
      <div className={s.meaningTrack}>
      <input id={`${id}-meanings`} className={controls.range} type="range" min={0} max={MEANING_LIMIT_STEPS.length-1} step={1} value={MEANING_LIMIT_STEPS.indexOf(value.meanings)} aria-valuetext={selected} onChange={event=>update({meanings:MEANING_LIMIT_STEPS[Number(event.target.value)]})}/>
      <div className={`${controls.sizeTicks} ${s.ticks}`} aria-hidden="true">{MEANING_LIMIT_STEPS.map((limit,index)=><span key={limit} style={{left:`${index/(MEANING_LIMIT_STEPS.length-1)*100}%`}}>{limit==="all"?t.all:limit}</span>)}</div>
      </div>
    </div>)}
    {rangeEdit&&<RangeEditor initialFrom={Number(rangeEdit.from)} initialTo={Number(rangeEdit.to)} language={language} title={compact?t.rangeDialogTitle:t.range} onCancel={()=>setRangeEdit(null)} onApply={(from,to)=>{update({from,to});setRangeEdit(null);}}/>}
  </div>;
}

export function VocabularySelectionHelp({language}:{language:OnboardingLanguage}){return <SettingsHelp label={copy[language].selection} text={copy[language].selectionHelp}/>;}
