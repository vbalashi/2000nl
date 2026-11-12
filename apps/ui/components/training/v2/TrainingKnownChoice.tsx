"use client";
import React from "react";
import { LogOut } from "lucide-react";
import { DirectionCard } from "@/components/practice/builder/DirectionCard";
import { getUiMessages } from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { fetchMeaningProgress } from "@/lib/platform/meaningProgressClient";
import { saveTrainingKnownChoice } from "@/lib/platform/trainingKnownChoiceClient";
import type { MeaningLearningProgress } from "../../../../../packages/shared/types/meaningLearningProgress";
import { meaningDirections, type MeaningDirection, type TrainingKnownChoiceRequest } from "../../../../../packages/shared/types/trainingKnownChoice";
import { TrainingCardShell, trainingStageClassName } from "./TrainingCardTemplates";
import approved from "../approvedTrainingCard.module.css";
import s from "./TrainingKnownChoice.module.css";

type Props = {
  entryId: string; sessionId: string; direction: MeaningDirection; headword: string; definition: string;
  language: OnboardingLanguage; contentLanguage: string; disabled?: boolean; dockHeight?: number;
  onBack: () => void; onAccepted: () => Promise<void>; onPendingChange?: (pending: boolean, token: object) => void;
  onStarting?: () => void;
};
/** Local draft only. Freeze one complete intent at submission, including retries. */
export function TrainingKnownChoice({entryId, sessionId, direction, headword, definition, language, contentLanguage, disabled=false, dockHeight=76, onBack, onAccepted, onPendingChange, onStarting}: Props) {
  const t=getUiMessages(language).trainingSession.knownChoice;
  const [progress,setProgress]=React.useState<MeaningLearningProgress|null>(null);
  const [known,setKnown]=React.useState<MeaningDirection[]>([]);
  const [error,setError]=React.useState<"loadFailed"|"failed"|"conflict"|null>(null);
  const [busy,setBusy]=React.useState(false);
  const [handedOff,setHandedOff]=React.useState(false);
  const handoffRef=React.useRef(false);
  const frozen=React.useRef<TrainingKnownChoiceRequest|null>(null), accepted=React.useRef(false), running=React.useRef(false);
  const mounted=React.useRef(true);
  const nextRef=React.useRef<HTMLButtonElement>(null);
  React.useEffect(()=>{
    mounted.current=true;
    const controller=new AbortController();
    void fetchMeaningProgress(entryId,controller.signal).then(value=>{
      if(controller.signal.aborted)return;
      setProgress(value);
      setKnown(meaningDirections.filter(d=>d===direction||Boolean(value.exclusionId)||Boolean(value.directions.find(state=>state.cardTypeId===d)?.knownMarkId)));
      nextRef.current?.focus({preventScroll:true});
    }).catch(()=>{if(!controller.signal.aborted)setError("loadFailed");});
    return ()=>{mounted.current=false;controller.abort();};
  },[entryId,direction]);
  const submit=async()=>{
    if(running.current||handoffRef.current||!progress||disabled||error==="conflict")return;
    running.current=true;setBusy(true);setError(null);
    const token={};onPendingChange?.(true,token);onStarting?.();
    frozen.current??={entryId,trainingSessionId:sessionId,currentDirection:direction,knownDirections:known,revision:progress.revision,clientEventId:crypto.randomUUID()};
    try{
      if(!accepted.current){await saveTrainingKnownChoice(frozen.current);accepted.current=true;}
      if(mounted.current){await onAccepted();handoffRef.current=true;if(mounted.current)setHandedOff(true);}
    }catch(cause){if(mounted.current)setError(cause instanceof Error&&cause.message==="training_known_choice_conflict"?"conflict":"failed");}
    finally{running.current=false;onPendingChange?.(false,token);if(mounted.current)setBusy(false);}
  };
  // An uncertain write must be reconciled with the same intent, not silently cancelled.
  const frozenUncertain=Boolean(frozen.current)&&!accepted.current&&error!=="conflict";
  return <section className={trainingStageClassName()} aria-label={t.choiceLabel}>
    <TrainingCardShell answerVisible={false}>
      <div className={s.body}>
        <LogOut size={40} strokeWidth={1.4} className={s.icon} aria-hidden="true"/>
        {!progress&&!error?<p className={s.loading} role="status">{t.loading}</p>:null}
        {progress?<div className={s.cards}>{meaningDirections.map(d=>{
          const isKnown=known.includes(d),direct=d==="word-to-definition";
          return <div key={d} className={s.direction} data-known={isKnown} role="group" aria-label={direct?t.direct:t.reverse}>
            <DirectionCard label={direct?t.direct:t.reverse} selected={false} prompt={direct?headword:definition} answer={direct?definition:headword} promptLanguage={contentLanguage} answerLanguage={contentLanguage}
              classes={{card:s.preview,heading:s.heading,check:"hidden",prompt:s.prompt,arrow:s.arrow,answer:s.answer}}/>
            <div className={s.status}><span role="status">{isKnown?t.known:t.learning}</span>
              <button type="button" className={s.link} disabled={busy||disabled||Boolean(frozen.current)} onClick={()=>setKnown(current=>isKnown?current.filter(value=>value!==d):[...current,d])}>{isKnown?t.returnToLearning:t.markKnown}</button>
            </div>
          </div>;
        })}</div>:null}
        {error?<p role="alert" className={s.error}>{t[error]}</p>:null}
        <button type="button" className={`${s.link} ${s.back}`} disabled={busy||disabled||frozenUncertain||accepted.current} onClick={onBack}>{t.back}</button>
      </div>
    </TrainingCardShell>
    <footer data-testid="training-sense-card-dock" className="shrink-0" style={{height:dockHeight}}>
      <button type="button" ref={nextRef} className={`${approved.primary} ${s.next}`} disabled={!progress||busy||handedOff||disabled||error==="conflict"} onClick={()=>void submit()}>{busy?t.saving:t.next}</button>
    </footer>
  </section>;
}
