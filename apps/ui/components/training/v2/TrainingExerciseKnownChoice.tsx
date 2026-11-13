"use client";
import React from 'react';
import {ArrowLeft,ArrowRight,LogOut} from 'lucide-react';
import {DirectionCard} from '@/components/practice/builder/DirectionCard';
import {getUiMessages} from '@/lib/uiMessages';
import {platformV2Message} from '@/lib/platform/platformV2ClientI18n';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {fetchExerciseChoice,saveExerciseChoice,type ExerciseChoiceSnapshot,type ExerciseChoiceRequest,type ExerciseDirection} from '@/lib/platform/exerciseChoiceClient';
import {TrainingCardShell,trainingStageClassName} from './TrainingCardTemplates';
import approved from '../approvedTrainingCard.module.css';
import builder from '../pilot/approvedTrainingBuilder.module.css';
import s from './TrainingKnownChoice.module.css';
type Props={targetId:string;entryId:string;sessionId:string;family:'idiom'|'translation';direction:ExerciseDirection;prompt:string;answer:string;language:OnboardingLanguage;contentLanguage:string;translationLanguage?:string;disabled?:boolean;originSide:'face'|'answer';onBack:()=>void;onStarting:()=>void;onAccepted:()=>Promise<void>;onSuperseded:()=>void};
export function TrainingExerciseKnownChoice(p:Props){
 const messages=getUiMessages(p.language),t=messages.trainingSession.knownChoice;
 const directionLabel=(d:ExerciseDirection)=>messages.trainingHistory.exercises[d==='recall'?'translation':d==='direct'?'idiomDirect':'idiomReverse'];
 const [snapshot,setSnapshot]=React.useState<ExerciseChoiceSnapshot|null>(null),[known,setKnown]=React.useState<ExerciseDirection[]>([]),[error,setError]=React.useState<'loadFailed'|'failed'|'conflict'|null>(null),[busy,setBusy]=React.useState(false),[done,setDone]=React.useState(false);
 const frozen=React.useRef<ExerciseChoiceRequest|null>(null),accepted=React.useRef(false),running=React.useRef(false),mounted=React.useRef(true);
 const next=React.useRef<HTMLButtonElement>(null);
 React.useEffect(()=>{mounted.current=true;void fetchExerciseChoice(p.targetId).then(value=>{if(!mounted.current)return;if(value.entryId!==p.entryId||value.family!==p.family||value.direction!==p.direction)throw new Error('mismatch');setSnapshot(value);setKnown([...new Set([...Object.keys(value.marks) as ExerciseDirection[],p.direction])]);next.current?.focus({preventScroll:true});}).catch(()=>{if(mounted.current)setError('loadFailed');});return()=>{mounted.current=false;};},[p.targetId,p.entryId,p.family,p.direction]);
 const submit=async()=>{if(running.current||done||!snapshot||p.disabled||error==='conflict')return;running.current=true;setBusy(true);setError(null);p.onStarting();frozen.current??={targetId:p.targetId,trainingSessionId:p.sessionId,knownDirections:known,revision:snapshot.revision,clientEventId:crypto.randomUUID()};try{if(!accepted.current){await saveExerciseChoice(frozen.current,p.entryId);accepted.current=true;}if(mounted.current){await p.onAccepted();if(mounted.current)setDone(true);}}catch(e){if(mounted.current){if(e instanceof Error&&e.message==='training_session_superseded')p.onSuperseded();else setError(e instanceof Error&&e.message==='training_known_choice_conflict'?'conflict':'failed');}}finally{running.current=false;if(mounted.current)setBusy(false);}};
 const directions:ExerciseDirection[]=p.family==='idiom'?['direct','reverse']:['recall'];
 return <section className={trainingStageClassName()} data-side={p.originSide} aria-label={t.choiceLabel}>
  <TrainingCardShell answerVisible={p.originSide==='answer'} contentLabel={platformV2Message(p.language,'senseCard.training.content')} scrollMoreLabel={platformV2Message(p.language,'senseCard.scroll.more')}><div className={s.body}><div className={s.content}>
   <LogOut size={40} strokeWidth={1.4} className={s.icon} aria-hidden="true"/>
   {!snapshot&&!error?<p className={s.loading} role="status">{t.loading}</p>:null}
   {snapshot?<div className={s.cards} data-single={directions.length===1}>{directions.map(d=>{const isKnown=known.includes(d),reverse=d==='reverse';return <div key={d} className={s.direction} data-known={isKnown} role="group" aria-label={directionLabel(d)}>
    <DirectionCard label={directionLabel(d)} labelIcon={reverse?<ArrowLeft size={14}/>:<ArrowRight size={14}/>} selected={false} prompt={reverse?p.answer:p.prompt} answer={reverse?p.prompt:p.answer} promptLanguage={p.family==='translation'?p.translationLanguage:p.contentLanguage} answerLanguage={p.contentLanguage} classes={{card:s.preview,heading:`${builder.directionHeading} ${s.heading}`,headingLabel:builder.directionHeadingLabel,check:'hidden',prompt:builder.prompt,arrow:builder.directionArrow,answer:builder.answer}}/>
    <div className={s.status}><span role="status" className={s.stateLabel}>{isKnown?t.known:t.learning}</span><button type="button" className={s.link} disabled={busy||p.disabled||Boolean(frozen.current)} onClick={()=>setKnown(current=>isKnown?current.filter(v=>v!==d):[...current,d])}>{isKnown?t.returnToLearning:t.markKnown}</button></div></div>;})}</div>:null}
   {error?<p role="alert" className={s.error}>{t[error]}</p>:null}</div>
   <button type="button" className={`${s.link} ${s.back}`} disabled={busy||p.disabled||(Boolean(frozen.current)&&error!=='conflict')||accepted.current} onClick={p.onBack}>{t.back}</button></div></TrainingCardShell>
  <footer data-testid="training-sense-card-dock" className="shrink-0" style={{height:76}}><button ref={next} type="button" className={`${approved.primary} ${s.next}`} disabled={!snapshot||busy||done||p.disabled||error==='conflict'} onClick={()=>void submit()}>{busy?t.saving:t.next}</button></footer>
 </section>;
}
