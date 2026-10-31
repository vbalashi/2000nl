"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TrainingSessionProgress } from "@/lib/training/sessionLifecycle";

type SessionProgress = {
  sessionId:string;
  completedActions:number;
  members?:ReadonlyArray<{targetId:string;consumedAt:string|null}>;
};
/** One progress/terminal handoff, independent of content. Acceptance is prepared
 * before transport so an intervening snapshot cannot count the same grade twice. */
export function useTrainingExerciseProgress(session:SessionProgress,onProgress?:(progress:TrainingSessionProgress)=>void) {
  const [completed,setCompleted]=useState(session.completedActions);
  const completedRef=useRef(session.completedActions);
  const latestSession=useRef(session);
  latestSession.current=session;
  const notifyRef=useRef(onProgress);
  notifyRef.current=onProgress;
  useEffect(()=>{
    if(session.completedActions>completedRef.current){completedRef.current=session.completedActions;setCompleted(session.completedActions);}
  },[session.completedActions]);
  const publish=useCallback((completedActions:number,completionReason:TrainingSessionProgress["completionReason"])=>{
    completedRef.current=completedActions;setCompleted(completedActions);
    notifyRef.current?.({sessionId:session.sessionId,completedActions,completionReason});
    return completedActions;
  },[session.sessionId]);
  const prepareAcceptance=useCallback((targetId:string)=>{
    const before=Math.max(completedRef.current,latestSession.current.completedActions);
    let settled=false;
    return ()=>{
      if(settled)return completedRef.current;
      settled=true;
      const snapshot=latestSession.current;
      const observed=Math.max(completedRef.current,snapshot.completedActions);
      const member=snapshot.members?.find(item=>item.targetId===targetId);
      // A complete snapshot tells us whether this exact member is included.
      // Without member identity, retain a conservative floor from intent creation.
      const next=member?.consumedAt ? observed : member ? observed+1 : Math.max(observed,before+1);
      return publish(next,null);
    };
  },[publish]);
  const finish=useCallback((result:{status:"completed"|"exhausted";completedActions?:number})=>
    publish(result.completedActions??completedRef.current,result.status),[publish]);
  return {completed,prepareAcceptance,finish};
}
