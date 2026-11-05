"use client";
import { localizedField, localizedSection } from "@/lib/i18n/catalog";

import React, { useId, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { frequencyRangeSteps, validFrequencyRange } from "@/lib/vocabulary/selection";
import { RangeStepControl } from "./RangeStepControl";
import { NumberWheel } from "./NumberWheel";
import { DialogSurface } from "../ui/DialogSurface";
import { IconAction } from "../ui/IconAction";
import controls from "../builder/builderControls.module.css";
import workspace from "../library/libraryWorkspace.module.css";
import s from "./vocabularySelection.module.css";

type Boundary="from"|"to";
type Mode="buttons"|"sliders"|"wheel";
const copy=localizedSection("rangeEditor");
export function RangeEditor({initialFrom,initialTo,language,title,onCancel,onApply}:{initialFrom:number;initialTo:number;language:OnboardingLanguage;title:string;onCancel:()=>void;onApply:(from:number,to:number)=>void}){
 const id=useId(),t=copy[language];
 const [mode]=useState<Mode>("buttons");
 const [step,setStep]=useState(1);
 const [draft,setDraft]=useState({from:String(initialFrom),to:String(initialTo)});
 const pending=useRef(draft);pending.current=draft;
 const from=Number(draft.from),to=Number(draft.to),valid=validFrequencyRange(from,to);
 const changeWheel=(boundary:Boundary,next:number)=>{
  const current=pending.current,start=Number(current.from),end=Number(current.to);
  const value=boundary==="from"?Math.max(1,Math.min(end,next)):Math.max(start,Math.min(Number.MAX_SAFE_INTEGER,next));
  pending.current={...current,[boundary]:String(value)};
  setDraft(pending.current);
  return value;
 };
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
   <>
    <RangeStepControl value={step} onChange={setStep} label={t.step}/>
    <div className={mode==="wheel"&&valid?s.wheelColumns:s.boundaries}>{(["from","to"] as const).map(boundary=><div key={boundary} className={controls.rangeGroup} role="group" aria-label={labels[boundary]}>
     {mode==="buttons"||!valid?<label htmlFor={`${id}-${boundary}`} className={controls.label}>{labels[boundary]}</label>:<span className={controls.label}>{labels[boundary]}</span>}
     {mode==="wheel"&&valid?<NumberWheel value={numbers[boundary]} min={boundary==="from"?1:from} max={boundary==="from"?to:Number.MAX_SAFE_INTEGER} step={step} label={labels[boundary]} language={language} describedBy={`${id}-wheel-help`} onChange={next=>changeWheel(boundary,next)}/>:<div className={s.stepper}>
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
