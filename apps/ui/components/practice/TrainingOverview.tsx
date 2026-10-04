"use client";

import React,{useEffect,useRef,useState} from "react";
import {AddAction} from "./ui/AddAction";
import {ArrowRight,ChevronDown,Play,Plus} from "lucide-react";
import {IconAction} from "./ui/IconAction";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {formatUiMessage,getUiMessages} from "@/lib/uiMessages";
import s from "./trainingOverview.module.css";

/** Presentation data, not a scheduler contract. Unknown counts remain unknown. */
export type TrainingOverviewItem={
 id:string;name:string;language:string;description:string;summary:string;
 completedToday:number|null;meaningCount:number|null;sessionSize:number|string;cardFilter?:"new"|"review"|"both";
 saved?:boolean;canLaunch:boolean;unavailableReason?:string;notice?:string;
};
export type TrainingOverviewAvailability={trainingId:string;status:"loading"|"ready"|"error";dueToday:number|null;totalReviews:number|null;stillNew:number|null;message?:string};
export type TrainingOverviewState=
 |{status:"loading"}
 |{status:"error";message:string}
 |{status:"ready";trainings:TrainingOverviewItem[];mainId:string|null;availability?:TrainingOverviewAvailability;resume?:{sessionId:string;trainingId:string;completed:number;total:number|null;training?:TrainingOverviewItem};emptyTraining?:{trainingId:string;message:string;canReviewAhead?:boolean}};
export type TrainingOverviewProps={
 state:TrainingOverviewState;interfaceLanguage?:OnboardingLanguage;
 onSelect?:(id:string)=>void;onLaunch:(id:string)=>void;onResume:(sessionId:string)=>void;
 onAvailabilityRetry?:()=>void;onEarlyReview?:(id:string)=>void;onEdit:(id:string)=>void;onCreate:()=>void;onRetry:()=>void;
};
function EditGlyph(){return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M9 3v6M15 15v6"/></svg>;}
function LoadGlyph(){return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18m-9 9V12m-3 3 3-3 3 3"/></svg>;}
function SelectedGlyph(){return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>;}
export function TrainingOverview({state,interfaceLanguage="en",onSelect,onLaunch,onResume,onEdit,onCreate,onRetry,onEarlyReview,onAvailabilityRetry}:TrainingOverviewProps){
 const copy=getUiMessages(interfaceLanguage).trainingOverview;
 const navigation=getUiMessages(interfaceLanguage).navigation;
 const list=useRef<HTMLDivElement>(null);
 const [more,setMore]=useState(false);
 const trainingCount=state.status==="ready"?state.trainings.length:0;
 const updateMore=()=>{const el=list.current;setMore(Boolean(el&&el.scrollTop+el.clientHeight<el.scrollHeight-3));};
 useEffect(()=>{
  const el=list.current;if(!el)return;
  const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(updateMore):null;
  observer?.observe(el);updateMore();return()=>observer?.disconnect();
 },[state.status,trainingCount]);
 if(state.status==="loading")return <div className={s.home} lang={interfaceLanguage} aria-busy="true"><h1 className={s.srOnly}>{navigation.training}</h1><p role="status">{copy.loading}</p></div>;
 if(state.status==="error")return <div className={s.home} lang={interfaceLanguage}><h1>{navigation.training}</h1><p role="alert">{state.message}</p><button className={s.start} onClick={onRetry}>{copy.retry}</button></div>;
 const resumable=state.resume&&(state.resume.total===null||state.resume.total>state.resume.completed)?state.resume:undefined;
 const main=resumable?.training??state.trainings.find(item=>item.id===(resumable?.trainingId||state.mainId));
 const resume=main&&resumable?.trainingId===main.id?resumable:undefined;
 const empty=main&&state.emptyTraining?.trainingId===main.id?state.emptyTraining:undefined;
 const availability=main&&state.availability?.trainingId===main.id?state.availability:undefined;
 const total=resume?.total??null;
 const completed=resume?Math.min(Math.max(resume.completed,0),total===null?Infinity:Math.max(total,0)):0;
 const pending=!resume&&availability?.status==="loading";
 const metrics=resume?[[copy.done,completed],[copy.remaining,total===null?null:Math.max(0,total-completed)]] as const:[[copy.dueToday,availability?.status==="ready"?availability.dueToday:null],[copy.totalReviews,availability?.status==="ready"?availability.totalReviews:null],[copy.stillNew,availability?.status==="ready"?availability.stillNew:null]] as const;
 const known=!resume&&availability?.status==="ready";
 const noReadyCards=known&&(Boolean(empty)||(main?.cardFilter==="new"?availability.stillNew===0:main?.cardFilter==="both"?availability.dueToday===0&&availability.stillNew===0:availability.dueToday===0));
 const readyEarly=noReadyCards&&(empty?empty.canReviewAhead:main?.cardFilter!=="new")&&(availability.totalReviews??0)>0&&onEarlyReview;
 const readyEdit=noReadyCards&&!readyEarly;
 const saved=state.trainings.filter(item=>item.saved!==false);
 return <div className={s.home} lang={interfaceLanguage}>
  <h1 className={s.srOnly}>{navigation.training}</h1>
  {main?<section className={s.hero} aria-label={resume?copy.currentTraining:copy.mainTraining}>
   <div className={s.heroTop}><span className={s.eyebrow}>{main.language}{resume?` · ${copy.inProgress}`:""}</span><IconAction className={s.icon} label={formatUiMessage(copy.edit,{name:main.name})} onClick={()=>onEdit(main.id)}><EditGlyph/></IconAction></div>
   <div><h2>{main.name}</h2><p className={s.description}>{main.description}</p></div>
   <dl className={s.numbers} aria-busy={pending} style={{"--metrics-count":metrics.length} as React.CSSProperties}>{metrics.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{pending?<span className={s.pulse} aria-label={copy.loading}/>:<span key={`${main.id}:${value}`} className={s.count}>{value??"—"}</span>}</dd></div>)}</dl>
   {resume&&total!==null&&total>0&&<div className={s.progress} role="progressbar" aria-label={copy.sessionProgress} aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}><span style={{width:`${completed/total*100}%`}}/></div>}
   {empty&&!known&&<p className={s.emptyMessage} role="status">{empty.message}</p>}
   {!resume&&availability?.status==="error"&&<p className={s.emptyMessage} role="status">{availability.message??copy.availabilityFailed}{onAvailabilityRetry&&<button className={s.retry} onClick={onAvailabilityRetry}>{copy.retry}</button>}</p>}
   <div className={s.heroActions}>{readyEarly?<button type="button" className={s.start} disabled={!main.canLaunch} onClick={()=>onEarlyReview?.(main.id)}><Play size={16} fill="currentColor"/>{copy.earlyReview}</button>:readyEdit?<button type="button" className={s.start} onClick={()=>onEdit(main.id)}>{copy.editTraining}</button>:empty&&!known?onEarlyReview&&empty.canReviewAhead&&<button type="button" className={s.start} disabled={!main.canLaunch} onClick={()=>onEarlyReview(main.id)}><Play size={16} fill="currentColor"/>{copy.earlyReview}</button>:<button type="button" className={s.start} disabled={!main.canLaunch} onClick={()=>resume?onResume(resume.sessionId):onLaunch(main.id)}><Play size={16} fill="currentColor"/>{resume?copy.continue:copy.start}<ArrowRight size={16}/></button>}</div>
   {main.notice&&<p className={s.description} role="status">{main.notice}</p>}
   {!main.canLaunch&&main.unavailableReason&&<p className={s.description} role="status">{main.unavailableReason}</p>}
  </section>:!state.trainings.length?<section className={s.hero}><h2>{copy.firstTraining}</h2><button type="button" className={s.start} onClick={onCreate}><Plus size={16}/>{copy.create}</button></section>:null}
  <section className={s.saved} aria-label={copy.saved}>
   <div className={s.savedHeading}><h2>{copy.saved}</h2><AddAction onClick={onCreate}>{copy.create}</AddAction></div>
   {saved.length?<><div ref={list} className={s.list} onScroll={updateMore} tabIndex={0}>{saved.map(item=><div className={`${s.row} ${item.id===state.mainId?s.selected:""}`} key={item.id}>
    <div className={s.rowText}><h3>{item.name}</h3><p>{item.summary}</p>{item.notice&&<p>{item.notice}</p>}{!item.canLaunch&&item.unavailableReason&&<p>{item.unavailableReason}</p>}</div>
    <IconAction className={s.icon} label={formatUiMessage(copy.edit,{name:item.name})} onClick={()=>onEdit(item.id)}><EditGlyph/></IconAction>
    <IconAction className={s.icon} label={formatUiMessage(copy.loadNamed,{name:item.name})} aria-pressed={item.id===state.mainId} onClick={()=>onSelect?.(item.id)}>{item.id===state.mainId?<SelectedGlyph/>:<LoadGlyph/>}</IconAction>
   </div>)}</div>{more&&<div className={s.fade}><button type="button" aria-label={copy.moreSaved} onClick={()=>list.current?.scrollBy({top:Math.max(100,list.current.clientHeight*.7),behavior:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"})}><ChevronDown size={16}/></button></div>}</>:<p className={s.emptySaved}>{copy.noSaved}</p>}
  </section>
 </div>;
}
