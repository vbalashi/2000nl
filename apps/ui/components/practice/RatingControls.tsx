"use client";
import React,{useLayoutEffect,useRef,useState} from "react";
import {getTrainingRatingLabels} from "@/components/training/trainingHotkeys";
import {getUiMessages} from "@/lib/uiMessages";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import s from "./ratingControls.module.css";
export type Rating="Again"|"Hard"|"Good"|"Easy";
export type RatingOption={rating:Rating;label:string};
/** `options` lets a runtime owner supply its own labels/subset; defaults to the four interface-language ratings. */
export function RatingControls({language="en",ink="tonal",marker="left",layout="auto",height=28,onRate,disabled=false,options,firstRef,label}:{disabled?:boolean;language?:OnboardingLanguage;ink?:"tonal"|"neutral";marker?:"left"|"bottom";layout?:"auto"|"two";height?:28|34|46|"adaptive";onRate:(rating:Rating)=>void;options?:RatingOption[];firstRef?:React.Ref<HTMLButtonElement>;label?:string}){
 const defaults=getTrainingRatingLabels(language);
 const items=options??(Object.entries(defaults) as [Rating,string][]).map(([rating,text])=>({rating,label:text}));
 const ref=useRef<HTMLDivElement>(null),measure=useRef<HTMLDivElement>(null);
 const [columns,setColumns]=useState(4);
 const labelKey=items.map(item=>item.label).join("|");
 useLayoutEffect(()=>{
  const root=ref.current,probe=measure.current;if(!root||!probe)return;
  const update=()=>{const labelWidth=Math.max(...Array.from(probe.children).map(el=>el.getBoundingClientRect().width));setColumns(root.clientWidth>=items.length*(labelWidth+32)+(items.length-1)*8?items.length:2);};
  const observer=new ResizeObserver(update);observer.observe(root);observer.observe(probe);update();
  return ()=>observer.disconnect();
 },[labelKey,items.length,height]);
 const displayedColumns=layout==="two"?2:Math.min(columns,items.length);
 const displayedHeight=height==="adaptive"?(displayedColumns===2&&items.length>2?28:46):height;
 return <div ref={ref} role="group" className={s.ratings} data-ink={ink} data-marker={marker} data-columns={displayedColumns} style={{"--rating-height":`${displayedHeight}px`} as React.CSSProperties} aria-label={label??getUiMessages(language).trainingSession.rate} lang={language}>
  <div ref={measure} className={s.measure} aria-hidden="true">{items.map(item=><span key={item.rating}>{item.label}</span>)}</div>
  {items.map((item,index)=><button type="button" ref={index===0?firstRef:undefined} disabled={disabled} key={item.rating} data-rating={item.rating} onClick={()=>onRate(item.rating)}><span>{item.label}</span></button>)}
 </div>;
}
