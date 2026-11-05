"use client";
import React, { useRef, useState } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { NumberWheel } from "./NumberWheel";
import { RangeStepControl } from "./RangeStepControl";
import controls from "../builder/builderControls.module.css";
import s from "./vocabularySelection.module.css";
const copy={ru:{from:"От",to:"До",step:"Шаг"},en:{from:"From",to:"To",step:"Step"},nl:{from:"Van",to:"Tot",step:"Stap"}};
export function FrequencyRangeWheels({from,to,language,onChange}:{from:number;to:number;language:OnboardingLanguage;onChange:(from:number,to:number)=>void}){
 const [step,setStep]=useState(1),t=copy[language];
 const pending=useRef({from,to});pending.current={from,to};
 const change=(boundary:"from"|"to",next:number)=>{
  const pair=pending.current;
  const value=boundary==="from"?Math.max(1,Math.min(pair.to,next)):Math.max(pair.from,Math.min(Number.MAX_SAFE_INTEGER,next));
  pending.current={...pair,[boundary]:value};
  onChange(pending.current.from,pending.current.to);
  return value;
 };
 return <div className={s.inlineRange}>
  <RangeStepControl value={step} onChange={setStep} label={t.step}/>
  <div className={s.wheelColumns}>
   <div><span className={controls.label}>{t.from}</span><NumberWheel value={from} min={1} max={to} step={step} label={t.from} language={language} visibleRows={3} onChange={next=>change("from",next)}/></div>
   <div><span className={controls.label}>{t.to}</span><NumberWheel value={to} min={from} max={Number.MAX_SAFE_INTEGER} step={step} label={t.to} language={language} visibleRows={3} onChange={next=>change("to",next)}/></div>
  </div>
 </div>;
}
