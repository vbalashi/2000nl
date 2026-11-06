"use client";
import { localizedField } from "@/lib/i18n/catalog";


import { trainingEmptyState } from "@/lib/training/availability/emptyState";
import { canContinueTrainingSession } from "@/lib/training/sessionLifecycle";
import React,{useEffect,useRef,useState} from "react";
import {FrequencyProfileIcon} from "@/components/practice/vocabulary/FrequencyProfileIcon";
import type {FrequencyProfile} from "@/lib/vocabulary/selection";
import {SessionMix,SessionSizeIcon} from "@/components/training/pilot/SessionSummaryIcons";
import {DirectionIcon} from "@/components/training/pilot/ExerciseSummaryIcons";
import type {TrainingMode} from "@/lib/types";
import {AddAction} from "./ui/AddAction";
import {ChevronDown,ChevronUp,Play,Plus,ListOrdered,BookOpen,Layers,Share2} from "lucide-react";
import {IconAction} from "./ui/IconAction";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {formatUiMessage,getUiMessages} from "@/lib/uiMessages";
import s from "./trainingOverview.module.css";

/** Presentation data, not a scheduler contract. Unknown counts remain unknown. */
export type TrainingOverviewItem={
 id:string;name:string;language:string;description:string;summary:string;sourceKind?:"dictionary"|"collection"|"shared";sourceLabel?:string;accessibleDescription?:string;accessibleSummary?:string;directionLabel?:string;directionModes?:readonly TrainingMode[];frequencyProfile?:FrequencyProfile;frequencyLabel?:string;meaningLabel?:string;meaningLimit?:number|"all";sessionLimitLabel?:string;sessionLimitValue?:number;mixSelectionLabel?:string;mixAccessibleLabel?:string;mixFilter?:"new"|"review"|"both";mixRatio?:number;
 completedToday:number|null;meaningCount:number|null;sessionSize:number|string;cardFilter?:"new"|"review"|"both";
 draftKey?:string;saved?:boolean;canLaunch:boolean;unavailableReason?:string;notice?:string;
};
export type TrainingOverviewAvailability={trainingId:string;status:"loading"|"ready"|"error";dueToday:number|null;totalReviews:number|null;stillNew:number|null;message?:string};
export type TrainingOverviewState=
 |{status:"loading"}
 |{status:"error";message:string}
 |{status:"ready";trainings:TrainingOverviewItem[];mainId:string|null;availability?:TrainingOverviewAvailability;resume?:{sessionId:string;trainingId:string;completed:number;total:number|null;training?:TrainingOverviewItem};emptyTraining?:{trainingId:string;message:string;canReviewAhead?:boolean;draftKey?:string}};
export type TrainingOverviewProps={
 state:TrainingOverviewState;launchPending?:boolean;interfaceLanguage?:OnboardingLanguage;
 onSelect?:(id:string)=>void;onLaunch:(id:string)=>void;onResume:(sessionId:string)=>void;
 onAvailabilityRetry?:()=>void;onEarlyReview?:(id:string)=>void;onEdit:(id:string,section?:"session")=>void;onCreate:()=>void;onRetry:()=>void;
};
function SourceKindIcon({kind}:{kind:"dictionary"|"collection"|"shared"}){const Icon=kind==="dictionary"?BookOpen:kind==="shared"?Share2:Layers;return <Icon size={14} aria-hidden="true"/>;}
function OverviewSummary({item,text,accessibleText}:{item:TrainingOverviewItem;text:string;accessibleText?:string}){
 const pieces=text.split(" · ");
 const hasSource=Boolean(item.sourceKind&&pieces[0]===item.language);
 const hasDirection=Boolean(item.directionLabel&&item.directionModes&&pieces.includes(item.directionLabel));
 const hasMix=Boolean(item.mixSelectionLabel&&item.mixAccessibleLabel&&item.mixFilter&&typeof item.mixRatio==="number"&&pieces.includes(item.mixSelectionLabel));
 const hasMeaning=Boolean(item.meaningLabel&&typeof item.meaningLimit==="number"&&pieces.includes(item.meaningLabel));
 const hasSession=Boolean(item.sessionLimitLabel&&typeof item.sessionLimitValue==="number"&&pieces.includes(item.sessionLimitLabel));
 const hasFrequency=Boolean(item.frequencyLabel&&item.frequencyProfile&&pieces.some(piece=>piece.startsWith(`${item.frequencyLabel} `)));
 if(!hasDirection&&!hasFrequency&&!hasMeaning&&!hasSession&&!hasMix&&!hasSource)return <>{text}</>;
 return <span aria-label={accessibleText??text}><span aria-hidden="true">{pieces.map((piece,index)=><React.Fragment key={index}>{index>0&&" · "}{index===0&&hasSource?<>{piece} <span className={s.directionIcon}><SourceKindIcon kind={item.sourceKind!}/></span></>:hasDirection&&piece===item.directionLabel?<span className={s.directionIcon}><DirectionIcon modes={item.directionModes!}/></span>:hasMix&&piece===item.mixSelectionLabel?<SessionMix filter={item.mixFilter!} ratio={item.mixRatio!} label={item.mixAccessibleLabel!}/>:hasMeaning&&piece===item.meaningLabel?<><span className={s.directionIcon}><ListOrdered size={15}/></span>{" "}{item.meaningLimit}</>:hasSession&&piece===item.sessionLimitLabel?<><span className={s.directionIcon}><SessionSizeIcon/></span>{" "}{item.sessionLimitValue}</>:hasFrequency&&piece.startsWith(`${item.frequencyLabel} `)?<><span className={s.directionIcon}><FrequencyProfileIcon profile={item.frequencyProfile!}/></span>{piece.slice(item.frequencyLabel!.length)}</>:piece}</React.Fragment>)}</span></span>;
}
function EditGlyph(){return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M9 3v6M15 15v6"/></svg>;}
function LoadGlyph(){return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18m-9 9V12m-3 3 3-3 3 3"/></svg>;}
function SelectedGlyph(){return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>;}
export function TrainingOverview({state:incomingState,launchPending=false,interfaceLanguage="en",onSelect,onLaunch,onResume,onEdit,onCreate,onRetry,onEarlyReview,onAvailabilityRetry}:TrainingOverviewProps){
 const reasonId=React.useId();
 // Accepted session data must not replace the launch hero during preparation.
 const settledState=useRef(incomingState);
 React.useLayoutEffect(()=>{if(!launchPending)settledState.current=incomingState;},[incomingState,launchPending]);
 const state=launchPending?settledState.current:incomingState;
 const copy=getUiMessages(interfaceLanguage).trainingOverview;
 const navigation=getUiMessages(interfaceLanguage).navigation;
 const list=useRef<HTMLDivElement>(null);
 const [more,setMore]=useState(false);
 const [above,setAbove]=useState(false);
 const trainingCount=state.status==="ready"?state.trainings.length:0;
 const updateMore=()=>{const el=list.current;setMore(Boolean(el&&el.scrollTop+el.clientHeight<el.scrollHeight-3));setAbove(Boolean(el&&el.scrollTop>3));};
 useEffect(()=>{
  const el=list.current;if(!el)return;
  const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(updateMore):null;
  observer?.observe(el);updateMore();return()=>observer?.disconnect();
 },[state.status,trainingCount]);
 if(state.status==="loading")return <div className={s.home} lang={interfaceLanguage} aria-busy="true"><h1 className={s.srOnly}>{navigation.training}</h1><p role="status">{copy.loading}</p></div>;
 if(state.status==="error")return <div className={s.home} lang={interfaceLanguage} aria-busy={launchPending}><h1>{navigation.training}</h1><p role="alert">{state.message}</p><button className={s.start} onClick={onRetry}>{copy.retry}</button></div>;
 const resumable=state.resume&&canContinueTrainingSession({completedActions:state.resume.completed,plannedTotal:state.resume.total})?state.resume:undefined;
 const main=resumable?.training??state.trainings.find(item=>item.id===(resumable?.trainingId||state.mainId));
 const resume=main&&resumable?.trainingId===main.id?resumable:undefined;
 const empty=main&&state.emptyTraining?.trainingId===main.id&&(!state.emptyTraining.draftKey||state.emptyTraining.draftKey===main.draftKey)?state.emptyTraining:undefined;
 const availability=main&&state.availability?.trainingId===main.id?state.availability:undefined;
 const total=resume?.total??null;
 const completed=resume?Math.min(Math.max(resume.completed,0),total===null?Infinity:Math.max(total,0)):0;
 const pending=!resume&&availability?.status==="loading";
 const metrics=resume?[[copy.done,completed],[copy.remaining,total===null?null:Math.max(0,total-completed)]] as const:[[copy.dueToday,availability?.status==="ready"?availability.dueToday:null],[copy.totalReviews,availability?.status==="ready"?availability.totalReviews:null],[copy.stillNew,availability?.status==="ready"?availability.stillNew:null]] as const;
 const known=!resume&&availability?.status==="ready";
 const noReadyCards=known&&(Boolean(empty)||(main?.cardFilter==="new"?availability.stillNew===0:main?.cardFilter==="both"?availability.dueToday===0&&availability.stillNew===0:availability.dueToday===0));
 const readyEarly=noReadyCards&&(empty?empty.canReviewAhead:main?.cardFilter!=="new")&&(availability.totalReviews??0)>0&&onEarlyReview;
 const readyEdit=(noReadyCards||Boolean(empty&&!known))&&!readyEarly&&!(empty&&!known&&empty.canReviewAhead&&onEarlyReview);
 const guidance=known?trainingEmptyState(interfaceLanguage,main?.cardFilter,availability):null;
 const emptyMessage=!resume?((!empty||empty.canReviewAhead?guidance?.message:undefined)??empty?.message):undefined;
 const includeNew=Boolean(noReadyCards&&guidance?.includeNew&&(!empty||empty.canReviewAhead));
 const saved=state.trainings.filter(item=>item.saved!==false);
 const noCards=localizedField("trainingOverviewState", "noMatchingCards")[interfaceLanguage];
 const emptyAction=<button type="button" className={s.start} data-empty="true" disabled aria-describedby={emptyMessage?reasonId:undefined}>{noCards}</button>;
 return <div className={s.home} lang={interfaceLanguage} aria-busy={launchPending}>
  <h1 className={s.srOnly}>{navigation.training}</h1>
  {main?<section className={s.hero} data-recipe="selected" aria-label={resume?copy.currentTraining:copy.mainTraining}>
   <div className={s.heroTop}><span className={s.eyebrow}>{main.language}{main.sourceKind&&<span className={s.sourceIcon} role="img" aria-label={main.sourceLabel} title={main.sourceLabel}><SourceKindIcon kind={main.sourceKind}/></span>}{resume?` · ${copy.inProgress}`:""}</span><IconAction className={s.icon} label={formatUiMessage(copy.edit,{name:main.name})} onClick={()=>onEdit(main.id)}><EditGlyph/></IconAction></div>
   <div className={s.heroIntro}><h2 title={main.name}>{main.name}</h2><p className={s.description} title={main.accessibleDescription??main.description}><OverviewSummary item={main} text={main.description} accessibleText={main.accessibleDescription}/></p></div>
   <dl className={s.numbers} aria-busy={pending} style={{"--metrics-count":metrics.length} as React.CSSProperties}>{metrics.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{pending?<span className={s.pulse} aria-label={copy.loading}/>:<span key={`${main.id}:${value}`} className={s.count}>{value??"—"}</span>}</dd></div>)}</dl>
   {resume&&total!==null&&total>0&&<div className={s.progress} role="progressbar" aria-label={copy.sessionProgress} aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}><span style={{width:`${completed/total*100}%`}}/></div>}
   {!resume&&availability?.status==="error"&&<p className={s.emptyMessage} role="status">{availability.message??copy.availabilityFailed}{onAvailabilityRetry&&<button className={s.retry} onClick={onAvailabilityRetry}>{copy.retry}</button>}</p>}
   <div className={s.heroActions} title={emptyMessage}>{includeNew?<button type="button" className={s.start} disabled={launchPending} onClick={()=>onEdit(main.id,"session")}>{copy.adjustMix}</button>:readyEarly?<button type="button" className={s.start} disabled={launchPending||!main.canLaunch} onClick={()=>onEarlyReview?.(main.id)}><Play size={16} fill="currentColor"/>{copy.earlyReview}</button>:readyEdit?emptyAction:empty&&!known?onEarlyReview&&empty.canReviewAhead?<button type="button" className={s.start} disabled={launchPending||!main.canLaunch} onClick={()=>onEarlyReview(main.id)}><Play size={16} fill="currentColor"/>{copy.earlyReview}</button>:emptyAction:<button type="button" className={s.start} disabled={launchPending||!main.canLaunch} data-onboarding="launch" onClick={()=>resume?onResume(resume.sessionId):onLaunch(main.id)}><Play size={16} fill="currentColor"/>{resume?copy.continue:copy.start}</button>}
    {emptyMessage&&<p id={reasonId} className={s.srOnly} role="status">{emptyMessage}</p>}
    {includeNew&&readyEarly&&<button type="button" className={s.retry} disabled={launchPending||!main.canLaunch} onClick={()=>onEarlyReview?.(main.id)}><Play size={16} fill="currentColor"/>{copy.earlyReview}</button>}
   </div>
   {main.notice&&<p className={s.description} role="status">{main.notice}</p>}
   {!main.canLaunch&&main.unavailableReason&&<p className={s.description} role="status">{main.unavailableReason}</p>}
  </section>:!state.trainings.length?<section className={s.hero}><h2>{copy.firstTraining}</h2><button type="button" className={s.start} data-onboarding="create-training" onClick={onCreate}><Plus size={16}/>{copy.create}</button></section>:null}
  <section className={s.saved} aria-label={copy.saved}>
   <div className={s.savedHeading}><h2>{copy.saved}</h2><span data-onboarding="create-training"><AddAction onClick={onCreate}>{copy.create}</AddAction></span></div>
   {saved.length?<div className={s.listViewport}><div ref={list} className={s.list} onScroll={updateMore} tabIndex={0}>{saved.map(item=><div className={`${s.row} ${item.id===state.mainId?s.selected:""}`} key={item.id}>
    <div className={s.rowText}><h3><button type="button" className={s.trainingName} aria-pressed={item.id===state.mainId} onClick={()=>onSelect?.(item.id)}>{item.name}</button></h3><p title={item.accessibleSummary??item.summary}><OverviewSummary item={item} text={item.summary} accessibleText={item.accessibleSummary}/></p>{item.notice&&<p>{item.notice}</p>}{!item.canLaunch&&item.unavailableReason&&<p>{item.unavailableReason}</p>}</div>
    <IconAction className={`${s.icon} ${s.rowAction}`} label={formatUiMessage(copy.loadNamed,{name:item.name})} aria-pressed={item.id===state.mainId} onClick={()=>onSelect?.(item.id)}>{item.id===state.mainId?<SelectedGlyph/>:<LoadGlyph/>}</IconAction>
    <IconAction className={`${s.icon} ${s.rowAction}`} label={formatUiMessage(copy.edit,{name:item.name})} onClick={()=>onEdit(item.id)}><EditGlyph/></IconAction>
   </div>)}</div>{above&&<div className={`${s.fade} ${s.fadeTop}`}><button type="button" aria-label={copy.previousSaved} onClick={()=>list.current?.scrollBy({top:-Math.max(100,list.current.clientHeight*.7),behavior:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"})}><ChevronUp size={16}/></button></div>}{more&&<div className={s.fade}><button type="button" aria-label={copy.moreSaved} onClick={()=>list.current?.scrollBy({top:Math.max(100,list.current.clientHeight*.7),behavior:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"})}><ChevronDown size={16}/></button></div>}</div>:<p className={s.emptySaved}>{copy.noSaved}</p>}
  </section>
 </div>;
}
