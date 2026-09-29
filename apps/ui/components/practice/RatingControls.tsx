"use client";
import React,{useLayoutEffect,useRef,useState} from "react";
import {getTrainingRatingLabels} from "@/components/training/trainingHotkeys";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import s from "./ratingControls.module.css";
export type Rating="Again"|"Hard"|"Good"|"Easy";
export function RatingControls({language="en",ink="tonal",marker="left",layout="auto",height=28,onRate,disabled=false}:{disabled?:boolean;language?:OnboardingLanguage;ink?:"tonal"|"neutral";marker?:"left"|"bottom";layout?:"auto"|"two";height?:28|34|46|"adaptive";onRate:(rating:Rating)=>void}){
 const labels=getTrainingRatingLabels(language);
 const ref=useRef<HTMLDivElement>(null),measure=useRef<HTMLDivElement>(null);
 const [columns,setColumns]=useState(4);
 useLayoutEffect(()=>{
  const root=ref.current,probe=measure.current;if(!root||!probe)return;
  const update=()=>{const labelWidth=Math.max(...Array.from(probe.children).map(el=>el.getBoundingClientRect().width));setColumns(root.clientWidth>=4*(labelWidth+32)+24?4:2);};
  const observer=new ResizeObserver(update);observer.observe(root);observer.observe(probe);update();
  return ()=>observer.disconnect();
 },[language,height]);
 const displayedColumns=layout==="two"?2:columns;
 const displayedHeight=height==="adaptive"?(displayedColumns===2?28:46):height;
 return <div ref={ref} className={s.ratings} data-ink={ink} data-marker={marker} data-columns={displayedColumns} style={{"--rating-height":`${displayedHeight}px`} as React.CSSProperties} aria-label="Rate your answer">
  <div ref={measure} className={s.measure} aria-hidden="true">{Object.values(labels).map(label=><span key={label}>{label}</span>)}</div>
  {(Object.entries(labels) as [Rating,string][]).map(([rating,label])=><button type="button" disabled={disabled} key={rating} data-rating={rating} onClick={()=>onRate(rating)}><span>{label}</span></button>)}
 </div>;
}
