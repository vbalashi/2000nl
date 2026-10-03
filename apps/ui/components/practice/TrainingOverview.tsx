"use client";

import React from "react";
import {AddAction} from "./ui/AddAction";
import {ArrowRight, Play, Plus, SlidersHorizontal} from "lucide-react";
import {IconAction} from "./ui/IconAction";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {formatUiMessage,getUiMessages} from "@/lib/uiMessages";
import s from "./trainingOverview.module.css";

/** Presentation data, not a scheduler contract. Unknown counts remain unknown. */
export type TrainingOverviewItem = {
 id:string; name:string; language:string; description:string; summary:string;
 completedToday:number|null; meaningCount:number|null; sessionSize:number|string;
 saved?:boolean; canLaunch:boolean; unavailableReason?:string; notice?:string;
};
export type TrainingOverviewState =
 | {status:"loading"}
 | {status:"error";message:string}
 | {status:"ready";trainings:TrainingOverviewItem[];mainId:string|null;resume?:{sessionId:string;trainingId:string;completed:number;total:number|null};emptyTraining?:{trainingId:string;message:string;canReviewAhead?:boolean}};
export type TrainingOverviewProps = {
 state:TrainingOverviewState;
 interfaceLanguage?:OnboardingLanguage;
 onLaunch:(id:string)=>void; onResume:(sessionId:string)=>void;
 onEarlyReview?:(id:string)=>void; onEdit:(id:string)=>void; onCreate:()=>void; onRetry:()=>void;
};
export function TrainingOverview({state,interfaceLanguage="en",onLaunch,onResume,onEdit,onCreate,onRetry,onEarlyReview}:TrainingOverviewProps){
 const copy=getUiMessages(interfaceLanguage).trainingOverview;
 const navigation=getUiMessages(interfaceLanguage).navigation;
 if(state.status==="loading")return <div className={s.home} lang={interfaceLanguage} aria-busy="true"><h1 className={s.srOnly}>{navigation.training}</h1><p role="status">{copy.loading}</p></div>;
 if(state.status==="error")return <div className={s.home} lang={interfaceLanguage}><h1>{navigation.training}</h1><p role="alert">{state.message}</p><button className={s.start} onClick={onRetry}>{copy.retry}</button></div>;
 const resumable=state.resume && (state.resume.total===null || state.resume.total>state.resume.completed)?state.resume:undefined;
 const main=state.trainings.find(item=>item.id===(resumable?.trainingId||state.mainId));
 const resume=main&&resumable?.trainingId===main.id?resumable:undefined;
 const empty=main&&state.emptyTraining?.trainingId===main.id?state.emptyTraining:undefined;
 const total=resume?.total??null;
 const completed=resume?Math.min(Math.max(resume.completed,0),total===null?Infinity:Math.max(total,0)):0;
 const hasProgress=resume&&total!==null&&total>0;
 return <div className={s.home} lang={interfaceLanguage}>
  <h1 className={s.srOnly}>{navigation.training}</h1>
  {main?<section className={s.hero} aria-label={resume?copy.currentTraining:copy.mainTraining}>
   <div className={s.heroTop}><span className={s.eyebrow}>{main.language}{resume?` · ${copy.inProgress}`:""}</span><IconAction className={s.icon} label={formatUiMessage(copy.edit,{name:main.name})} onClick={()=>onEdit(main.id)}><SlidersHorizontal size={18}/></IconAction></div>
   <h2>{main.name}</h2><p className={s.description}>{main.description}</p>
   <dl className={s.numbers} style={{"--metrics-count":(resume||main.completedToday!==null?1:0)+(main.meaningCount!==null?1:0)+1} as React.CSSProperties}>{(resume||main.completedToday!==null)&&<div><dt>{resume?copy.done:copy.doneToday}</dt><dd>{resume?completed:main.completedToday}</dd></div>}{main.meaningCount!==null&&<div><dt>{copy.meanings}</dt><dd>{main.meaningCount}</dd></div>}<div><dt>{resume?copy.remaining:copy.perSession}</dt><dd>{resume?total===null?"—":Math.max(0,total-completed):main.sessionSize}</dd></div></dl>
   {hasProgress&&<div className={s.progress} role="progressbar" aria-label={copy.sessionProgress} aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}><span style={{width:`${completed/total*100}%`}}/></div>}
   {empty&&<p className={s.emptyMessage} role="status">{empty.message}</p>}
   <div className={s.heroActions}>
    {empty ? onEarlyReview&&empty.canReviewAhead&&<button type="button" className={s.start} disabled={!main.canLaunch} onClick={()=>onEarlyReview(main.id)}><Play size={17} fill="currentColor"/>{copy.earlyReview}<ArrowRight size={18}/></button> : <button type="button" className={s.start} disabled={!main.canLaunch} onClick={()=>resume?onResume(resume.sessionId):onLaunch(main.id)}><Play size={17} fill="currentColor"/>{resume?copy.continue:copy.start}<ArrowRight size={18}/></button>}
    <button type="button" className={s.configure} onClick={()=>onEdit(main.id)}>{copy.adjust}</button>
   </div>
   {main.notice&&<p className={s.description} role="status">{main.notice}</p>}
   {!main.canLaunch&&main.unavailableReason&&<p className={s.description} role="status">{main.unavailableReason}</p>}
  </section>:!state.trainings.length?<section className={s.hero}><h2>{copy.firstTraining}</h2><button type="button" className={s.start} onClick={onCreate}><Plus size={17}/>{copy.create}</button></section>:null}
  {state.trainings.length>0&&<><div className={s.savedHeading}><h2>{copy.saved}</h2><AddAction onClick={onCreate}>{copy.create}</AddAction></div>
  <div className={s.list}>{state.trainings.filter(item=>item.saved!==false).map(item=><div className={s.row} key={item.id}>
   <div className={s.rowText}><h3>{item.name}</h3><p>{item.summary}</p>{item.notice&&<p>{item.notice}</p>}{!item.canLaunch&&item.unavailableReason&&<p>{item.unavailableReason}</p>}</div>
   <IconAction className={s.icon} label={formatUiMessage(copy.edit,{name:item.name})} onClick={()=>onEdit(item.id)}><SlidersHorizontal size={17}/></IconAction>
   <IconAction className={s.rowPlay} label={formatUiMessage(copy.startNamed,{name:item.name})} disabled={!item.canLaunch} onClick={()=>onLaunch(item.id)}><Play size={17}/></IconAction>
  </div>)}</div></>}
 </div>;
}
