"use client";
import React, { useId, useState } from "react";
import { FrequencyRangeWheels } from "./FrequencyRangeWheels";
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

const copy = {
  ru: { selection:"Отбор слов", allWords:"Все слова", frequency:"По частотности", speech:"Где встречаются", spoken:"Разговорная речь", written:"Письменная речь", range:"Места в списке", edit:"Изменить диапазон", from:"От", to:"До", first:"Первая граница диапазона", last:"Последняя граница диапазона", meanings:"Значений на статью", all:"Все", allMeanings:"Все значения", firstMeaning:"Первое значение", firstMeanings:(n:number)=>`Первые ${n} значения`, cancel:"Отмена", apply:"Готово", invalid:"Начните с 1 или больше. Конец диапазона должен быть не меньше начала.", selectionHelp:"Можно выбрать все слова или только те, которые чаще встречаются в разговорной или письменной речи. В отбор по частотности попадут только слова, для которых есть эти данные.", speechHelp:"Разговорная речь — слова из живых разговоров, по данным CGN. Письменная речь — слова из текстов, по данным SoNaR500. В разговоре и на письме одни и те же слова могут встречаться с разной частотой.", rangeHelp:"Чем меньше номер, тем чаще встречается слово. Например, 1–100 — сто самых частых слов, а 101–200 — следующие сто. Покажем те из них, которые есть в выбранном словаре и подходят под ваши настройки. Поэтому слов может оказаться меньше. Проведите по числам вверх или вниз. Шаг определяет, насколько меняется число. Для ручного ввода нажмите на карандаш.", meaningHelp:["У одного слова бывает несколько значений. Например, lopen — «идти пешком», «работать» (о моторе) или «проходить» (о мероприятии).", "Значения перечислены в словаре по порядку. Здесь можно взять первое, первые два или три — либо оставить все. Если значений меньше, берём все, которые есть. У каждой отдельной статьи свой лимит.", "В тренировке «Только новые» уже изучаемые значения не подойдут. Если первые два уже изучаются, они просто не попадут в такую тренировку. Третье вместо них не добавляем."] },
  en: { selection:"Choose words", allWords:"All words", frequency:"By frequency", speech:"Where they occur", spoken:"Spoken language", written:"Written language", range:"Places in the list", edit:"Edit range", from:"From", to:"To", first:"First range boundary", last:"Last range boundary", meanings:"Meanings per entry", all:"All", allMeanings:"All meanings", firstMeaning:"First meaning", firstMeanings:(n:number)=>`First ${n} meanings`, cancel:"Cancel", apply:"Done", invalid:"Start at 1 or higher. The end must be at least the start.", selectionHelp:"Choose all words, or words used more often in speech or writing. Frequency selection includes only words for which these figures are available.", speechHelp:"Spoken language uses conversations from CGN. Written language uses texts from SoNaR500. A word can be common in speech and less common in writing.", rangeHelp:"A lower number means a more common word. For example, 1–100 selects the hundred most common words. We show those found in your dictionary that match your other settings, so there may be fewer. Swipe the numbers up or down. The step sets how far each change moves. Select the pencil to type an exact range.", meaningHelp:["A word can have several meanings. For example, lopen can describe walking, a motor running, or an event taking place.", "Meanings follow dictionary order. Choose the first one, two or three, or keep them all. If there are fewer, take those available. Each separate dictionary entry has its own limit.", "In a new-only session, meanings already being learned are left out. If the first two are already being learned, they will not appear in that session. We do not replace them with the third."] },
  nl: { selection:"Woorden kiezen", allWords:"Alle woorden", frequency:"Op frequentie", speech:"Waar ze voorkomen", spoken:"Gesproken taal", written:"Geschreven taal", range:"Plaatsen in de lijst", edit:"Bereik wijzigen", from:"Van", to:"Tot", first:"Eerste grens van het bereik", last:"Laatste grens van het bereik", meanings:"Betekenissen per artikel", all:"Alle", allMeanings:"Alle betekenissen", firstMeaning:"Eerste betekenis", firstMeanings:(n:number)=>`Eerste ${n} betekenissen`, cancel:"Annuleren", apply:"Gereed", invalid:"Begin bij 1 of hoger. Het einde mag niet lager zijn dan het begin.", selectionHelp:"Kies alle woorden, of woorden die vaker voorkomen in gesprekken of teksten. De frequentiekeuze bevat alleen woorden waarvoor deze gegevens beschikbaar zijn.", speechHelp:"Gesproken taal gebruikt gesprekken uit CGN. Geschreven taal gebruikt teksten uit SoNaR500. Een woord kan in gesprekken vaker voorkomen dan in teksten.", rangeHelp:"Een lager getal betekent een vaker gebruikt woord. Bijvoorbeeld: 1–100 kiest de honderd meest voorkomende woorden. We tonen de woorden uit je woordenboek die bij je andere instellingen passen. Dat kunnen er minder zijn. Veeg over de getallen omhoog of omlaag. De stap bepaalt hoeveel het getal verandert. Gebruik het potlood voor een precies bereik.", meaningHelp:["Een woord kan verschillende betekenissen hebben. Denk bij lopen aan naar huis lopen, een motor die loopt of een evenement dat goed loopt.", "De betekenissen staan op volgorde in het woordenboek. Kies de eerste, de eerste twee of drie, of alle betekenissen. Zijn er minder, dan nemen we wat er is. Elk apart artikel heeft een eigen limiet.", "In een training met alleen nieuwe betekenissen slaan we betekenissen over die je al leert. Leer je de eerste twee al, dan komen ze niet in die training. De derde komt niet in hun plaats."] },
};
export function VocabularySelectionFields({ value, onChange, language, section="all", showSelectionHeading=true }: { showSelectionHeading?:boolean; section?:"all"|"selection"|"meanings"; value: VocabularySelection; onChange:(next:VocabularySelection)=>void; language:OnboardingLanguage }) {
  const id=useId(), t=copy[language];
  const [rangeEdit,setRangeEdit]=useState<{from:string;to:string}|null>(null);
  const update=(patch:Partial<VocabularySelection>)=>onChange({...value,...patch});
  const selected=value.meanings==="all"?t.allMeanings:value.meanings===1?t.firstMeaning:t.firstMeanings(value.meanings);
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
          <IconAction className={`${controls.selection} ${s.rangeValue}`} label={`${t.edit}: ${rangeLabel}`} onClick={()=>setRangeEdit({from:String(value.from),to:String(value.to)})}><Pencil size={15} aria-hidden="true"/></IconAction>
        </div>
        <FrequencyRangeWheels from={value.from} to={value.to} language={language} onChange={(from,to)=>update({from,to})}/>
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
