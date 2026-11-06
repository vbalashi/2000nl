"use client";
import { localizedSection } from "@/lib/i18n/catalog";
import React, {useLayoutEffect,useRef} from "react";
import {formatUiCount, getUiMessages} from "@/lib/uiMessages";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import type {TrainingAvailabilityState} from "@/lib/training/availability/useTrainingAvailability";
import local from "./trainingAvailabilityStrip.module.css";

/** Localized templates own word order; numbers retain visual emphasis. */
function sentence(template:string, variables:Record<string,React.ReactNode>){
 return template.split(/(\{[a-zA-Z]+\})/g).map((part,index)=>{
  const match=/^\{([a-zA-Z]+)\}$/.exec(part);
  return <React.Fragment key={index}>{match?variables[match[1]]:part}</React.Fragment>;
 });
}
function emphasizedCount(text:string,number:string){
 const index=text.indexOf(number);
 return index<0?text:<>{text.slice(0,index)}<strong>{number}</strong>{text.slice(index+number.length)}</>;
}
export function TrainingAvailabilityStrip({state,language,onRetry}:{state:TrainingAvailabilityState;language:OnboardingLanguage;onRetry?:()=>void}){
 const t=getUiMessages(language), copy=localizedSection("trainingAvailability")[language];
 const updating=state.status==="loading"||(state.status==="ready"&&state.refreshing);
 const failed=state.status==="error"||(state.status==="ready"&&state.refreshFailed);
 const value=state.status==="ready"&&!updating&&!failed?state.value:null;
 // Keep the previous geometry during a recalculation without presenting stale counts.
 const lastValue=useRef<typeof value>(null);
 if(value) lastValue.current=value;
 const displayValue=value??lastValue.current;
 const spaceRef=useRef<HTMLDivElement>(null);
 const summaryRef=useRef<HTMLParagraphElement>(null);
 const reservedHeight=useRef(0);
 useLayoutEffect(()=>{
  const space=spaceRef.current,summary=summaryRef.current;
  if(!space||!summary||!value||typeof ResizeObserver==="undefined")return;
  const reserve=()=>{const height=summary.getBoundingClientRect().height;const currentMin=parseFloat(getComputedStyle(space).minBlockSize)||0;if(height>Math.max(reservedHeight.current,currentMin)){reservedHeight.current=height;space.style.minBlockSize=`${height}px`;}};
  const observer=new ResizeObserver(reserve);observer.observe(summary);reserve();return()=>observer.disconnect();
 },[value,language]);
 const number=(n:number)=>n.toLocaleString(language);
 return <section className={local.strip} aria-label={copy.title}>
  <div ref={spaceRef} className={local.summarySpace}>
  {displayValue&&<p ref={summaryRef} className={`${local.summary} ${!value?local.hidden:""}`} aria-hidden={!value} aria-live={value?"polite":"off"}>
   {displayValue.totalWords!==undefined&&displayValue.totalMeanings!==undefined&&displayValue.totalCards!==undefined&&<>
    {sentence(copy.sentenceFound,{
     words:emphasizedCount(formatUiCount(language,displayValue.totalWords,copy,"wordCount"),number(displayValue.totalWords)),
     meanings:emphasizedCount(formatUiCount(language,displayValue.totalMeanings,t.librarySearch,"meaningCount"),number(displayValue.totalMeanings))
    })}{" "}
    {displayValue.totalCards!==displayValue.totalMeanings&&<>{sentence(copy.sentenceCards,{cards:<strong>{number(displayValue.totalCards)}</strong>})}{" "}</>}
   </>}
   {sentence(copy.sentenceProgress,{learning:<strong>{number(displayValue.totalReviews)}</strong>,new:<strong>{number(displayValue.newCards)}</strong>,due:<strong>{number(displayValue.dueToday)}</strong>})}
   {displayValue.totalCards!==undefined&&displayValue.totalCards>displayValue.totalReviews+displayValue.newCards&&<> {sentence(copy.sentenceOther,{other:<strong>{number(displayValue.totalCards-displayValue.totalReviews-displayValue.newCards)}</strong>})}</>}
  </p>}
  {(updating||state.status==="idle")&&<p className={local.status} role="status" aria-live="polite">{copy.updating}</p>}
  {failed&&<p role="alert" className={local.error}>{copy.error} <button type="button" className={local.retry} onClick={onRetry}>{t.trainingOverview.retry}</button></p>}
  </div>
 </section>;
}
