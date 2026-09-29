"use client";

import React from "react";
import {ArrowRight, Play, Plus, SlidersHorizontal} from "lucide-react";
import {IconAction} from "./ui/IconAction";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {formatUiMessage,getUiMessages} from "@/lib/uiMessages";
import s from "./trainingOverview.module.css";

/** Presentation data, not a scheduler contract. Unknown counts remain unknown. */
export type TrainingOverviewItem = {
 id:string; name:string; language:string; description:string; summary:string;
 completedToday:number|null; meaningCount:number|null; sessionSize:number;
 canLaunch:boolean; unavailableReason?:string;
};
export type TrainingOverviewState =
 | {status:"loading"}
 | {status:"error";message:string}
 | {status:"ready";trainings:TrainingOverviewItem[];mainId:string|null;resume?:{sessionId:string;trainingId:string;completed:number;total:number}};
export type TrainingOverviewProps = {
 state:TrainingOverviewState;
 interfaceLanguage?:OnboardingLanguage;
 onLaunch:(id:string)=>void; onResume:(sessionId:string)=>void;
 onEdit:(id:string)=>void; onCreate:()=>void; onRetry:()=>void;
};
export function TrainingOverview({state,interfaceLanguage="en",onLaunch,onResume,onEdit,onCreate,onRetry}:TrainingOverviewProps){
 const copy=getUiMessages(interfaceLanguage).trainingOverview;
 const navigation=getUiMessages(interfaceLanguage).navigation;
 if(state.status==="loading")return <div className={s.home} lang={interfaceLanguage} aria-busy="true"><h1 className={s.srOnly}>{navigation.training}</h1><p role="status">{copy.loading}</p></div>;
 if(state.status==="error")return <div className={s.home} lang={interfaceLanguage}><h1>{navigation.training}</h1><p role="alert">{state.message}</p><button className={s.start} onClick={onRetry}>{copy.retry}</button></div>;
 const main=state.trainings.find(item=>item.id===(state.resume?.trainingId||state.mainId));
 const resume=main&&state.resume?.trainingId===main.id?state.resume:undefined;
 const completed=resume?Math.min(Math.max(resume.completed,0),Math.max(resume.total,0)):0;
 const hasProgress=resume&&resume.total>0;
 return <div className={s.home} lang={interfaceLanguage}>
  <h1 className={s.srOnly}>{navigation.training}</h1>
  {main?<section className={s.hero} aria-label={resume?copy.currentTraining:copy.mainTraining}>
   <div className={s.heroTop}><span className={s.eyebrow}>{main.language}{resume?` · ${copy.inProgress}`:""}</span><IconAction className={s.icon} label={formatUiMessage(copy.edit,{name:main.name})} onClick={()=>onEdit(main.id)}><SlidersHorizontal size={18}/></IconAction></div>
   <h2>{main.name}</h2><p className={s.description}>{main.description}</p>
   <dl className={s.numbers}><div><dt>{resume?copy.done:copy.doneToday}</dt><dd>{resume?completed:main.completedToday??"—"}</dd></div><div><dt>{copy.meanings}</dt><dd>{main.meaningCount??"—"}</dd></div><div><dt>{resume?copy.remaining:copy.perSession}</dt><dd>{resume?Math.max(0,resume.total-completed):main.sessionSize}</dd></div></dl>
   {hasProgress&&<div className={s.progress} role="progressbar" aria-label={copy.sessionProgress} aria-valuemin={0} aria-valuemax={resume.total} aria-valuenow={completed}><span style={{width:`${completed/resume.total*100}%`}}/></div>}
   <div className={s.heroActions}><button type="button" className={s.start} disabled={!main.canLaunch} onClick={()=>resume?onResume(resume.sessionId):onLaunch(main.id)}><Play size={17} fill="currentColor"/>{resume?copy.continue:copy.start}<ArrowRight size={18}/></button><button type="button" className={s.configure} onClick={()=>onEdit(main.id)}>{copy.adjust}</button></div>
   {!main.canLaunch&&main.unavailableReason&&<p className={s.description} role="status">{main.unavailableReason}</p>}
  </section>:!state.trainings.length?<section className={s.hero}><h2>{copy.firstTraining}</h2><button type="button" className={s.start} onClick={onCreate}><Plus size={17}/>{copy.create}</button></section>:null}
  {state.trainings.length>0&&<><div className={s.savedHeading}><h2>{copy.saved}</h2><button type="button" onClick={onCreate}><Plus size={16}/>{copy.create}</button></div>
  <div className={s.list}>{state.trainings.filter(item=>item.id!==main?.id).map(item=><div className={s.row} key={item.id}>
   <div className={s.rowText}><h3>{item.name}</h3><p>{item.summary}</p>{!item.canLaunch&&item.unavailableReason&&<p>{item.unavailableReason}</p>}</div>
   <IconAction className={s.icon} label={formatUiMessage(copy.edit,{name:item.name})} onClick={()=>onEdit(item.id)}><SlidersHorizontal size={17}/></IconAction>
   <IconAction className={s.rowPlay} label={formatUiMessage(copy.startNamed,{name:item.name})} disabled={!item.canLaunch} onClick={()=>onLaunch(item.id)}><Play size={17}/></IconAction>
  </div>)}</div></>}
 </div>;
}
