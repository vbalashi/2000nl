"use client";
import React, { useId, useState } from "react";
import { Pencil } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { MEANING_LIMIT_STEPS, frequencyRangeSteps, validFrequencyRange, type VocabularySelection } from "@/lib/vocabulary/selection";
import { BuilderChoice } from "../builder/BuilderChoice";
import { SegmentedControl } from "../ui/SegmentedControl";
import { IconAction } from "../ui/IconAction";
import { DialogSurface } from "../ui/DialogSurface";
import { SettingsHelp } from "../settings/SettingsHelp";
import controls from "../builder/builderControls.module.css";
import builder from "@/components/training/pilot/approvedTrainingBuilder.module.css";
import workspace from "../library/libraryWorkspace.module.css";
import s from "./vocabularySelection.module.css";

const copy = {
  ru: { selection:"Отбор слов", allWords:"Все слова", frequency:"По частотности", speech:"Где встречаются", spoken:"Разговорная речь", written:"Письменная речь", range:"Места в списке", edit:"Изменить диапазон", from:"От", to:"До", first:"Первая граница диапазона", last:"Последняя граница диапазона", meanings:"Значений на статью", all:"Все", allMeanings:"Все значения", firstMeaning:"Первое значение", firstMeanings:(n:number)=>`Первые ${n} значения`, cancel:"Отмена", apply:"Готово", invalid:"Начните с 1 или больше. Конец диапазона должен быть не меньше начала.", meaningHint:(n:number)=>`У каждой отдельной статьи берём ${n===1?"первое значение":`первые ${n} значения`}. Если их меньше, берём все.`, allHint:"Берём все значения каждой отдельной статьи.", selectionHelp:"Можно выбрать все слова или только те, которые чаще встречаются в разговорной или письменной речи. В отбор по частотности попадут только слова, для которых есть эти данные.", speechHelp:"Разговорная речь — слова из живых разговоров, по данным CGN. Письменная речь — слова из текстов, по данным SoNaR500. В разговоре и на письме одни и те же слова могут встречаться с разной частотой.", rangeHelp:"Чем меньше номер, тем чаще встречается слово. Например, 1–100 — сто самых частых слов, а 101–200 — следующие сто. Покажем те из них, которые есть в выбранном словаре и подходят под ваши настройки. Поэтому слов может оказаться меньше. Для точного диапазона нажмите на числа.", meaningHelp:"Берём первые значения в порядке словаря. Сначала выбираем значения, затем проверяем, нужны новые или повторение. Если первые два уже изучаются, третье вместо них не добавляем. У каждой отдельной статьи свой лимит." },
  en: { selection:"Choose words", allWords:"All words", frequency:"By frequency", speech:"Where they occur", spoken:"Spoken language", written:"Written language", range:"Places in the list", edit:"Edit range", from:"From", to:"To", first:"First range boundary", last:"Last range boundary", meanings:"Meanings per entry", all:"All", allMeanings:"All meanings", firstMeaning:"First meaning", firstMeanings:(n:number)=>`First ${n} meanings`, cancel:"Cancel", apply:"Done", invalid:"Start at 1 or higher. The end must be at least the start.", meaningHint:(n:number)=>`Take the first ${n===1?"meaning":`${n} meanings`} of each entry, or all if there are fewer.`, allHint:"Take every meaning of each entry.", selectionHelp:"Choose all words, or words used more often in speech or writing. Frequency selection includes only words for which these figures are available.", speechHelp:"Spoken language uses conversations from CGN. Written language uses texts from SoNaR500. A word can be common in speech and less common in writing.", rangeHelp:"A lower number means a more common word. For example, 1–100 selects the hundred most common words. We show those found in your dictionary that match your other settings, so there may be fewer. Select the numbers to enter an exact range.", meaningHelp:"Meanings follow dictionary order. We select them before checking learning status. Later meanings do not replace selected meanings already being learned. Each separate entry has its own limit." },
  nl: { selection:"Woorden kiezen", allWords:"Alle woorden", frequency:"Op frequentie", speech:"Waar ze voorkomen", spoken:"Gesproken taal", written:"Geschreven taal", range:"Plaatsen in de lijst", edit:"Bereik wijzigen", from:"Van", to:"Tot", first:"Eerste grens van het bereik", last:"Laatste grens van het bereik", meanings:"Betekenissen per artikel", all:"Alle", allMeanings:"Alle betekenissen", firstMeaning:"Eerste betekenis", firstMeanings:(n:number)=>`Eerste ${n} betekenissen`, cancel:"Annuleren", apply:"Gereed", invalid:"Begin bij 1 of hoger. Het einde mag niet lager zijn dan het begin.", meaningHint:(n:number)=>`Neem de eerste ${n===1?"betekenis":`${n} betekenissen`} van elk artikel, of alle als er minder zijn.`, allHint:"Neem alle betekenissen van elk artikel.", selectionHelp:"Kies alle woorden, of woorden die vaker voorkomen in gesprekken of teksten. De frequentiekeuze bevat alleen woorden waarvoor deze gegevens beschikbaar zijn.", speechHelp:"Gesproken taal gebruikt gesprekken uit CGN. Geschreven taal gebruikt teksten uit SoNaR500. Een woord kan in gesprekken vaker voorkomen dan in teksten.", rangeHelp:"Een lager getal betekent een vaker gebruikt woord. Bijvoorbeeld: 1–100 kiest de honderd meest voorkomende woorden. We tonen de woorden uit je woordenboek die bij je andere instellingen passen. Dat kunnen er minder zijn. Klik op de getallen om een precies bereik in te voeren.", meaningHelp:"Betekenissen volgen de volgorde van het woordenboek. Eerst kiezen we de betekenissen, daarna controleren we de leerstatus. Latere betekenissen vervangen geen betekenissen die je al leert. Elk apart artikel heeft een eigen limiet." },
};
export function VocabularySelectionFields({ value, onChange, language }: { value: VocabularySelection; onChange:(next:VocabularySelection)=>void; language:OnboardingLanguage }) {
  const id=useId(), t=copy[language];
  const [rangeEdit,setRangeEdit]=useState<{from:string;to:string}|null>(null);
  const update=(patch:Partial<VocabularySelection>)=>onChange({...value,...patch});
  const steps=frequencyRangeSteps(value.from,value.to), lower=steps.indexOf(value.from), upper=steps.indexOf(value.to);
  const selected=value.meanings==="all"?t.allMeanings:value.meanings===1?t.firstMeaning:t.firstMeanings(value.meanings);
  const rangeLabel=`${value.from.toLocaleString(language)}–${value.to.toLocaleString(language)}`;
  const formFrom=Number(rangeEdit?.from),formTo=Number(rangeEdit?.to),valid=validFrequencyRange(formFrom,formTo);
  return <div className={s.fields}>
    <div className={builder.field}>
      <h2 className={s.heading}>{t.selection}<SettingsHelp label={t.selection} text={t.selectionHelp}/></h2>
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
          <IconAction className={`${controls.selection} ${s.rangeValue}`} label={`${t.edit}: ${rangeLabel}`} onClick={()=>setRangeEdit({from:String(value.from),to:String(value.to)})}>{rangeLabel}<Pencil size={12} aria-hidden="true"/></IconAction>
        </div>
        <div className={s.dualRange} style={{"--range-start":`${lower/(steps.length-1)*100}%`,"--range-end":`${upper/(steps.length-1)*100}%`} as React.CSSProperties}>
          <div className={s.rail} aria-hidden="true"/>
          <input className={controls.range} type="range" min={0} max={upper} step={1} value={lower} style={{width:`calc(${upper/(steps.length-1)*100}% + ${16*(1-upper/(steps.length-1))}px)`}} aria-label={t.first} aria-valuetext={String(value.from)} onChange={event=>update({from:steps[Number(event.target.value)]})}/>
          <input className={controls.range} type="range" min={0} max={steps.length-1} step={1} value={upper} aria-label={t.last} aria-valuetext={String(value.to)} onChange={event=>update({to:steps[Math.max(Number(event.target.value),lower)]})}/>
        </div>
        <div className={controls.sizeTicks} aria-hidden="true">{steps.map((rank,index)=>[1,100,1000,steps.at(-1)].includes(rank)&&<span key={rank} style={{left:`${index/(steps.length-1)*100}%`}}>{rank.toLocaleString(language)}</span>)}</div>
      </div>
    </div>}
    <div className={controls.rangeGroup}>
      <div className={controls.labelRow}><div className={s.heading}><label htmlFor={`${id}-meanings`} className={controls.label}>{t.meanings}</label><SettingsHelp label={t.meanings} text={t.meaningHelp}/></div><span className={controls.selection}>{selected}</span></div>
      <input id={`${id}-meanings`} className={controls.range} type="range" min={0} max={MEANING_LIMIT_STEPS.length-1} step={1} value={MEANING_LIMIT_STEPS.indexOf(value.meanings)} aria-valuetext={selected} onChange={event=>update({meanings:MEANING_LIMIT_STEPS[Number(event.target.value)]})}/>
      <div className={controls.sizeTicks} aria-hidden="true">{MEANING_LIMIT_STEPS.map((limit,index)=><span key={limit} style={{left:`${index/(MEANING_LIMIT_STEPS.length-1)*100}%`}}>{limit==="all"?t.all:limit}</span>)}</div>
      <p className={controls.help}>{value.meanings==="all"?t.allHint:t.meaningHint(value.meanings)}</p>
    </div>
    {rangeEdit&&<DialogSurface onDismiss={()=>setRangeEdit(null)} aria-labelledby={`${id}-range-title`} className={s.rangeDialog}>
      <form onSubmit={event=>{event.preventDefault();if(valid){update({from:formFrom,to:formTo});setRangeEdit(null);}}}>
        <h2 id={`${id}-range-title`}>{t.range}</h2>
        <div className={s.rangeInputs}>
          <label className={workspace.label}>{t.from}<input autoFocus className={workspace.field} type="number" min={1} step={1} required value={rangeEdit.from} onChange={event=>setRangeEdit({...rangeEdit,from:event.target.value})}/></label>
          <label className={workspace.label}>{t.to}<input className={workspace.field} type="number" min={1} step={1} required value={rangeEdit.to} onChange={event=>setRangeEdit({...rangeEdit,to:event.target.value})}/></label>
        </div>
        {!valid&&<p className={workspace.error} role="alert">{t.invalid}</p>}
        <div className={s.rangeActions}><button className={workspace.button} type="button" onClick={()=>setRangeEdit(null)}>{t.cancel}</button><button className={workspace.button} type="submit" disabled={!valid}>{t.apply}</button></div>
      </form>
    </DialogSurface>}
  </div>;
}
