"use client";

import React from "react";
import {ArrowRight, Play, Plus, SlidersHorizontal} from "lucide-react";
import {IconAction} from "./ui/IconAction";
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
 onLaunch:(id:string)=>void; onResume:(sessionId:string)=>void;
 onEdit:(id:string)=>void; onCreate:()=>void; onRetry:()=>void;
};
export function TrainingOverview({state,onLaunch,onResume,onEdit,onCreate,onRetry}:TrainingOverviewProps){
 if(state.status==="loading")return <div className={s.home} aria-busy="true"><h1 className={s.srOnly}>Training</h1><p role="status">Loading training…</p></div>;
 if(state.status==="error")return <div className={s.home}><h1>Training</h1><p role="alert">{state.message}</p><button className={s.start} onClick={onRetry}>Try again</button></div>;
 const main=state.trainings.find(item=>item.id===(state.resume?.trainingId||state.mainId));
 const resume=main&&state.resume?.trainingId===main.id?state.resume:undefined;
 const completed=resume?Math.min(Math.max(resume.completed,0),Math.max(resume.total,0)):0;
 const hasProgress=resume&&resume.total>0;
 return <div className={s.home}>
  <h1 className={s.srOnly}>Training</h1>
  {main?<section className={s.hero} aria-label={resume?"Current training":"Main training"}>
   <div className={s.heroTop}><span className={s.eyebrow}>{main.language}{resume?" · IN PROGRESS":""}</span><IconAction className={s.icon} label={`Edit ${main.name}`} onClick={()=>onEdit(main.id)}><SlidersHorizontal size={18}/></IconAction></div>
   <h2>{main.name}</h2><p className={s.description}>{main.description}</p>
   <dl className={s.numbers}><div><dt>done today</dt><dd>{main.completedToday??"—"}</dd></div><div><dt>meanings</dt><dd>{main.meaningCount??"—"}</dd></div><div><dt>{resume?"remaining":"per session"}</dt><dd>{resume?Math.max(0,resume.total-completed):main.sessionSize}</dd></div></dl>
   {hasProgress&&<div className={s.progress} role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={resume.total} aria-valuenow={completed}><span style={{width:`${completed/resume.total*100}%`}}/></div>}
   <div className={s.heroActions}><button type="button" className={s.start} disabled={!main.canLaunch} onClick={()=>resume?onResume(resume.sessionId):onLaunch(main.id)}><Play size={17} fill="currentColor"/>{resume?"Continue training":"Start training"}<ArrowRight size={18}/></button><button type="button" className={s.configure} onClick={()=>onEdit(main.id)}>Adjust</button></div>
   {!main.canLaunch&&main.unavailableReason&&<p className={s.description} role="status">{main.unavailableReason}</p>}
  </section>:!state.trainings.length?<section className={s.hero}><h2>Your first training</h2><button type="button" className={s.start} onClick={onCreate}><Plus size={17}/> Create training</button></section>:null}
  {state.trainings.length>0&&<><div className={s.savedHeading}><h2>Saved training</h2><button type="button" onClick={onCreate}><Plus size={16}/> Create training</button></div>
  <div className={s.list}>{state.trainings.filter(item=>item.id!==main?.id).map(item=><div className={s.row} key={item.id}>
   <div className={s.rowText}><h3>{item.name}</h3><p>{item.summary}</p>{!item.canLaunch&&item.unavailableReason&&<p>{item.unavailableReason}</p>}</div>
   <IconAction className={s.icon} label={`Edit ${item.name}`} onClick={()=>onEdit(item.id)}><SlidersHorizontal size={17}/></IconAction>
   <IconAction className={s.rowPlay} label={`Start ${item.name}`} disabled={!item.canLaunch} onClick={()=>onLaunch(item.id)}><Play size={17}/></IconAction>
  </div>)}</div></>}
 </div>;
}
