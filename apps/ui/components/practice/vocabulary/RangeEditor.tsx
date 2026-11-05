"use client";
import React, { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { frequencyRangeSteps, validFrequencyRange } from "@/lib/vocabulary/selection";
import { RangeStepControl } from "./RangeStepControl";
import { NumberWheel } from "./NumberWheel";
import { DialogSurface } from "../ui/DialogSurface";
import { SegmentedControl } from "../ui/SegmentedControl";
import { BuilderChoice } from "../builder/BuilderChoice";
import { IconAction } from "../ui/IconAction";
import controls from "../builder/builderControls.module.css";
import workspace from "../library/libraryWorkspace.module.css";
import s from "./vocabularySelection.module.css";

type Boundary="from"|"to";
type Mode="buttons"|"sliders"|"wheel";
const copy={
 ru:{mode:"Способ настройки",buttons:"Кнопки",sliders:"Две шкалы",wheel:"Колёсики",wheelHint:"Прокрутите число вверх или вниз, проведите по нему пальцем или нажмите соседнее число. Шаг задаёт, насколько меняется число. С клавиатуры — стрелки вверх и вниз.",from:"От",to:"До",step:"Шаг",cancel:"Отмена",apply:"Готово",minusFrom:"Уменьшить начало",plusFrom:"Увеличить начало",minusTo:"Уменьшить конец",plusTo:"Увеличить конец",fromSlider:"Шкала начала диапазона",toSlider:"Шкала конца диапазона",hint:"Шкалы помогают быстро выбрать примерное число. Кнопки «−» и «+» уточняют его на выбранный шаг.",invalid:"Начните с 1 или больше. Конец диапазона должен быть не меньше начала."},
 en:{mode:"Adjustment method",buttons:"Buttons",sliders:"Two sliders",wheel:"Wheels",wheelHint:"Scroll up or down, swipe vertically, or select a nearby number. The step sets how far each change moves. With a keyboard, use the up and down arrows.",from:"From",to:"To",step:"Step",cancel:"Cancel",apply:"Done",minusFrom:"Decrease start",plusFrom:"Increase start",minusTo:"Decrease end",plusTo:"Increase end",fromSlider:"Range start slider",toSlider:"Range end slider",hint:"Use the sliders for a quick approximate choice. The minus and plus buttons refine it by the selected step.",invalid:"Start at 1 or higher. The end must be at least the start."},
 nl:{mode:"Manier van instellen",buttons:"Knoppen",sliders:"Twee schuiven",wheel:"Wielen",wheelHint:"Scroll omhoog of omlaag, veeg verticaal of kies een nabijgelegen getal. De stap bepaalt hoeveel het getal verandert. Gebruik op het toetsenbord de pijlen omhoog en omlaag.",from:"Van",to:"Tot",step:"Stap",cancel:"Annuleren",apply:"Gereed",minusFrom:"Begin verlagen",plusFrom:"Begin verhogen",minusTo:"Einde verlagen",plusTo:"Einde verhogen",fromSlider:"Schuif voor begin bereik",toSlider:"Schuif voor einde bereik",hint:"Gebruik de schuiven voor een snelle, globale keuze. De min- en plusknoppen verfijnen het getal met de gekozen stap.",invalid:"Begin bij 1 of hoger. Het einde mag niet lager zijn dan het begin."},
};
export function RangeEditor({initialFrom,initialTo,language,title,onCancel,onApply}:{initialFrom:number;initialTo:number;language:OnboardingLanguage;title:string;onCancel:()=>void;onApply:(from:number,to:number)=>void}){
 const id=useId(),t=copy[language];
 const [mode,setMode]=useState<Mode>("buttons"),[step,setStep]=useState(1);
 const [draft,setDraft]=useState({from:String(initialFrom),to:String(initialTo)});
 const from=Number(draft.from),to=Number(draft.to),valid=validFrequencyRange(from,to);
 const numbers={from,to};
 const change=(boundary:Boundary,delta:number)=>setDraft(current=>{
  const start=Number(current.from),end=Number(current.to);
  const safeStart=Number.isSafeInteger(start)&&start>=1?start:initialFrom;
  const safeEnd=Number.isSafeInteger(end)&&end>=safeStart?end:Math.max(initialTo,safeStart);
  const value=boundary==="from"?Math.max(1,Math.min(safeEnd,safeStart+delta)):Math.max(safeStart,Math.min(Number.MAX_SAFE_INTEGER,safeEnd+delta));
  return {from:String(safeStart),to:String(safeEnd),[boundary]:String(value)};
 });
 const steps=frequencyRangeSteps(valid?from:initialFrom,valid?to:initialTo);
 const indexFrom=Math.max(0,steps.indexOf(from)),indexTo=Math.max(indexFrom,steps.indexOf(to));
 const labels={from:t.from,to:t.to};
 return <DialogSurface onDismiss={onCancel} aria-labelledby={`${id}-title`} className={s.rangeDialog}>
  <form onSubmit={event=>{event.preventDefault();if(valid)onApply(from,to);}}>
   <h2 id={`${id}-title`}>{title}</h2>
   <SegmentedControl standard label={t.mode}>{(["buttons","sliders","wheel"] as const).map(option=><BuilderChoice key={option} active={mode===option} onClick={()=>setMode(option)}>{t[option]}</BuilderChoice>)}</SegmentedControl>
   <>
    <RangeStepControl value={step} onChange={setStep} label={t.step}/>
    <div className={mode==="wheel"&&valid?s.wheelColumns:s.boundaries}>{(["from","to"] as const).map(boundary=><div key={boundary} className={controls.rangeGroup} role="group" aria-label={labels[boundary]}>
     {mode==="buttons"||!valid?<label htmlFor={`${id}-${boundary}`} className={controls.label}>{labels[boundary]}</label>:<span className={controls.label}>{labels[boundary]}</span>}
     {mode==="wheel"&&valid?<NumberWheel value={numbers[boundary]} min={boundary==="from"?1:from} max={boundary==="from"?to:Number.MAX_SAFE_INTEGER} step={step} label={labels[boundary]} language={language} describedBy={`${id}-wheel-help`} onChange={next=>setDraft(current=>({...current,[boundary]:String(next)}))}/>:<div className={s.stepper}>
      <IconAction className={`${workspace.button} ${s.stepAction}`} label={boundary==="from"?t.minusFrom:t.minusTo} disabled={valid&&(boundary==="from"?from<=1:to<=from)} onClick={()=>change(boundary,-step)}><Minus size={16}/></IconAction>
      {mode==="buttons"||!valid?<input id={`${id}-${boundary}`} aria-label={labels[boundary]} className={`${workspace.field} ${s.stepValue}`} type="number" inputMode="numeric" min={boundary==="from"?1:(valid?from:1)} max={boundary==="from"&&valid?to:Number.MAX_SAFE_INTEGER} step={1} required value={draft[boundary]} onChange={event=>setDraft(current=>({...current,[boundary]:event.target.value}))}/>:<output className={controls.selection} aria-live="polite">{numbers[boundary].toLocaleString(language)}</output>}
      <IconAction className={`${workspace.button} ${s.stepAction}`} label={boundary==="from"?t.plusFrom:t.plusTo} disabled={valid&&(boundary==="from"?from>=to:to>=Number.MAX_SAFE_INTEGER)} onClick={()=>change(boundary,step)}><Plus size={16}/></IconAction>
     </div>}
     {mode==="sliders"&&<>
      <input type="range" className={controls.range} disabled={!valid} min={boundary==="from"?0:indexFrom} max={boundary==="from"?indexTo:steps.length-1} step={1} value={boundary==="from"?indexFrom:indexTo} aria-label={boundary==="from"?t.fromSlider:t.toSlider} aria-valuetext={String(numbers[boundary])} onChange={event=>setDraft(current=>({...current,[boundary]:String(steps[Number(event.target.value)])}))}/>
      <div className={controls.ends} aria-hidden="true"><span>{boundary==="from"?1:(valid?from:initialFrom).toLocaleString(language)}</span><span>{boundary==="from"?(valid?to:initialTo).toLocaleString(language):steps.at(-1)!.toLocaleString(language)}</span></div>
     </>}
    </div>)}</div>
    {mode==="wheel"&&<p id={`${id}-wheel-help`} className={controls.help}>{t.wheelHint}</p>}
    {mode==="sliders"&&<p className={controls.help}>{t.hint}</p>}
   </>
   {!valid&&<p className={workspace.error} role="alert">{t.invalid}</p>}
   <div className={s.rangeActions}><button className={workspace.button} type="button" onClick={onCancel}>{t.cancel}</button><button className={workspace.button} type="submit" disabled={!valid}>{t.apply}</button></div>
  </form>
 </DialogSurface>;
}
