"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTrainingOperationScope } from "./useTrainingOperationScope";
import { useTrainingExerciseProgress } from "./useTrainingExerciseProgress";
import type { TrainingSessionProgress } from "@/lib/training/sessionLifecycle";
import type { PlatformTrainingExerciseReviewResultV2 } from "../../../../packages/shared/types/platformV2";
import type { TrainingOperation } from "@/lib/training/trainingOperationScope";
import { beginTrainingUserTransition, createTrainingTransitionId, finishTrainingUserTransition, measureTrainingTransitionStage, type TrainingTransitionStage } from "@/lib/training/trainingTransitionTiming";

type Candidate = {targetId:string;targetKey:string;entryId:string};
type UnavailableReason = "projection-missing" | "dictionary-access-revoked" | "entry-not-found" | "pair-excluded";
export type ExerciseNext<C> = (C & {status:"ready";ordinal:number})
  | {status:"completed"|"exhausted"|"superseded"|"not-member";completedActions?:number}
  | {status:"unavailable";targetId:string;reason:UnavailableReason};
export type ExercisePreparation<T> = {state:"ready";content:T}
  | {state:"translation-pending"|"translation-unavailable"}
  | {state:Exclude<UnavailableReason,"pair-excluded">};
export type TrainingExerciseAdapter<C,T> = {
  next: (signal:AbortSignal)=>Promise<ExerciseNext<C>>;
  capturePreparation: ()=> (candidate:C,signal:AbortSignal,force:boolean)=>Promise<ExercisePreparation<T>>;
  markUnavailable: (targetId:string,reason:UnavailableReason)=>Promise<unknown>;
  act: (candidate:C,result:PlatformTrainingExerciseReviewResultV2,eventId:string)=>Promise<unknown>;
  timing: {selection:TrainingTransitionStage;preparation:TrainingTransitionStage};
};

/** Shared exercise lifecycle. Content/target models and transport remain adapters.
 * Accepted mutations settle before next preparation; retries never repeat them. */
export function useTrainingExerciseSession<C extends Candidate,T>(input:{
  identity:string;
  preparationIdentity:string;
  session:{sessionId:string;completedActions:number;plannedTotal:number;members?:Array<{targetId:string;consumedAt:string|null;unavailableAt:string|null}>};
  adapter:TrainingExerciseAdapter<C,T>;
  onProgress?: (progress:TrainingSessionProgress)=>void;
  onSuperseded:()=>void;
}) {
  const operations=useTrainingOperationScope(input.identity);
  const callbacks=useRef(input);
  useLayoutEffect(()=>{callbacks.current=input;});
  const [candidate,setCandidate]=useState<(C & {status:"ready";ordinal:number})|null>(null);
  const [content,setContent]=useState<T|null>(null);
  const [revealed,setRevealed]=useState(false);
  const [loading,setLoading]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [failed,setFailed]=useState(false);
  const [superseded,setSuperseded]=useState(false);
  const [pendingEntryId,setPendingEntryId]=useState<string|null>(null);
  const [pendingIdentity,setPendingIdentity]=useState(input.preparationIdentity);
  const [terminal,setTerminal]=useState<"complete"|"empty"|null>(input.session.plannedTotal===0 ? input.session.completedActions>0 ? "complete" : "empty" : null);
  const {completed,prepareAcceptance,finish}=useTrainingExerciseProgress(input.session,input.onProgress);
  const retired=useRef(false),busy=useRef(false),trailingRead=useRef(false);
  const activeLoad=useRef<TrainingOperation|null>(null);
  const transition=useRef<string|null>(null);
  const intent=useRef<{candidate:C;result:PlatformTrainingExerciseReviewResultV2;eventId:string;commit:()=>number}|null>(null);
  const [actionRetryRequired,setActionRetryRequired]=useState(false);
  const externalAcceptance=useRef<{targetId:string;commit:()=>number}|null>(null);
  const endTransition=useCallback((outcome:string)=>{
    if(transition.current)finishTrainingUserTransition(transition.current,outcome);
    transition.current=null;
  },[]);
  const replaceSession=useCallback(()=>{
    if(retired.current)return;
    retired.current=true;operations.reset();intent.current=null;activeLoad.current=null;trailingRead.current=false;
    endTransition("session-superseded");
    setSuperseded(true);setCandidate(null);setContent(null);setLoading(false);setSubmitting(false);setFailed(false);setPendingEntryId(null);setActionRetryRequired(false);
    callbacks.current.onSuperseded();
  },[operations,endTransition]);

  const loadNext=useCallback(async(force=false,recovery=false)=>{
    if(retired.current||intent.current)return;
    if(recovery && activeLoad.current?.isCurrent()){trailingRead.current=true;return;}
    trailingRead.current=false;
    const operation=operations.begin("selection");activeLoad.current=operation;
    const adapter=callbacks.current.adapter;
    const preparationIdentity=callbacks.current.preparationIdentity;
    const prepare=adapter.capturePreparation();
    endTransition("cancelled");
    const transitionId=createTrainingTransitionId();transition.current=transitionId;beginTrainingUserTransition(transitionId,"continue");
    setLoading(true);setFailed(false);setTerminal(null);setCandidate(null);setContent(null);setRevealed(false);if(!recovery)setPendingEntryId(null);
    let pending=false;
    try {
      for(let attempt=0;attempt<8;attempt++){
        const next=await measureTrainingTransitionStage(transitionId,adapter.timing.selection,()=>adapter.next(operation.signal));
        if(!operation.isCurrent())return;
        if(next.status==="superseded"){replaceSession();return;}
        if(next.status==="ready"){
          const loaded=await measureTrainingTransitionStage(transitionId,adapter.timing.preparation,()=>prepare(next,operation.signal,force));
          if(!operation.isCurrent())return;
          if(loaded.state==="ready"){setCandidate(next);setContent(loaded.content);return;}
          if(loaded.state==="translation-pending"){pending=true;setPendingIdentity(preparationIdentity);setPendingEntryId(next.entryId);endTransition("content-pending");return;}
          if(loaded.state==="translation-unavailable"){setFailed(true);endTransition("error-translation-unavailable");return;}
          await adapter.markUnavailable(next.targetId,loaded.state);
          if(!operation.isCurrent())return;
          continue;
        }
        if(next.status==="unavailable"){
          await adapter.markUnavailable(next.targetId,next.reason);
          if(!operation.isCurrent())return;
          continue;
        }
        if(next.status==="completed"||next.status==="exhausted"){
          const count=finish({...next,status:next.status});setTerminal(count>0?"complete":"empty");endTransition(`terminal-${next.status}`);return;
        }
        setFailed(true);endTransition(`error-${next.status}`);return;
      }
      setFailed(true);endTransition("error-retries-exhausted");
    }catch(cause){
      if(!operation.isCurrent())return;
      if(cause instanceof Error&&cause.message==="training_session_superseded"){replaceSession();return;}
      setFailed(true);endTransition("error-request");
    }finally{
      if(operation.isCurrent()){
        activeLoad.current=null;setLoading(false);
        if(!pending)setPendingEntryId(null);
        if(pending&&trailingRead.current)void loadNext(false,true);
      }
    }
  },[operations,endTransition,finish,replaceSession]);
  useEffect(()=>{if(candidate&&content)endTransition("ready");},[candidate,content,endTransition]);
  useEffect(()=>{
    retired.current=false;busy.current=false;intent.current=null;externalAcceptance.current=null;trailingRead.current=false;
    setSuperseded(false);setSubmitting(false);setActionRetryRequired(false);
    return ()=>{operations.reset();activeLoad.current=null;trailingRead.current=false;endTransition("cancelled");};
  },[input.identity,operations,endTransition]);
  useEffect(()=>{
    void loadNext();
    return ()=>{operations.cancel("selection");activeLoad.current=null;trailingRead.current=false;endTransition("cancelled");};
  },[input.identity,input.preparationIdentity,loadNext,operations,endTransition]);

  // An authoritative snapshot can retire the visible member after another client
  // changes progress. Preserve a still-valid revealed turn; reload only that member.
  useEffect(()=>{
    if(!candidate || submitting || retired.current)return;
    const members=input.session.members;
    const member=members?.find(item=>item.targetId===candidate.targetId);
    if(members && ((member && (member.consumedAt || member.unavailableAt)) || (!member && members.length>0))){
      intent.current=null;setActionRetryRequired(false);void loadNext();
    }
  },[candidate,input.session.members,submitting,loadNext]);

  const performIntent=useCallback(async()=>{
    const request=intent.current;
    if(!request||busy.current||retired.current)return;
    const operation=operations.begin("action");busy.current=true;setSubmitting(true);setFailed(false);
    try{
      await callbacks.current.adapter.act(request.candidate,request.result,request.eventId);
      if(!operation.isCurrent())return;
      intent.current=null;setActionRetryRequired(false);request.commit();
      await loadNext();
    }catch(cause){
      if(!operation.isCurrent())return;
      if(cause instanceof Error&&cause.message==="training_session_superseded"){replaceSession();return;}
      setFailed(true);setActionRetryRequired(true);
    }finally{if(operation.isCurrent()){busy.current=false;setSubmitting(false);}}
  },[operations,loadNext,replaceSession]);
  const grade=useCallback(async(result:PlatformTrainingExerciseReviewResultV2)=>{
    if(!candidate||!content||busy.current||retired.current||intent.current)return;
    intent.current={candidate:structuredClone(candidate),result,eventId:crypto.randomUUID(),commit:prepareAcceptance(candidate.targetId)};
    await performIntent();
  },[candidate,content,performIntent,prepareAcceptance]);
  const retry=useCallback(async(force=false)=>{
    if(intent.current)await performIntent();else await loadNext(force);
  },[performIntent,loadNext]);
  const prepareExternalAcceptance=useCallback(()=>{
    if(candidate && externalAcceptance.current?.targetId!==candidate.targetId){
      externalAcceptance.current={targetId:candidate.targetId,commit:prepareAcceptance(candidate.targetId)};
    }
  },[candidate,prepareAcceptance]);
  const acceptAndAdvance=useCallback(async()=>{
    if(retired.current||!candidate)return;
    const commit=externalAcceptance.current?.commit??prepareAcceptance(candidate.targetId);
    externalAcceptance.current=null;commit();await loadNext();
  },[candidate,prepareAcceptance,loadNext]);
  return {candidate,content,setContent,revealed,setRevealed,loading,submitting,failed,setFailed,
    superseded,pendingEntryId:pendingIdentity===input.preparationIdentity?pendingEntryId:null,terminal,completed,actionRetryRequired,loadNext,retry,grade,prepareExternalAcceptance,acceptAndAdvance,replaceSession,operations};
}
