"use client";
import React from "react";
import {defaultTrainingInteractions, type TrainingInteractions} from "@/lib/preferences/trainingInteractions";
import {trainingInteractionRepository, type TrainingInteractionRepository} from "@/lib/preferences/trainingInteractionRepository";
export {defaultTrainingInteractions, parseTrainingInteractions, type TrainingInteractions} from "@/lib/preferences/trainingInteractions";
type Status = "loading" | "ready" | "error";
const Context = React.createContext({
 preferences:defaultTrainingInteractions,
 save:async (_value:TrainingInteractions)=>{},
 loadStatus:"ready" as Status,
 saveStatus:"idle" as "idle"|"saving"|"error",
 reload:()=>{},
});
export const useTrainingInteractions=()=>React.useContext(Context);
/** One account preference owner for every signed-in device. No browser storage. */
export function TrainingInteractionPreferencesProvider({userId,children,initial,repository=trainingInteractionRepository}: {
 userId:string; children:React.ReactNode; initial?:TrainingInteractions; repository?:TrainingInteractionRepository;
}) {
 return <InteractionSession key={userId} userId={userId} initial={initial} repository={repository}>{children}</InteractionSession>;
}
function InteractionSession({userId,children,initial,repository}: {
 userId:string; children:React.ReactNode; initial?:TrainingInteractions; repository:TrainingInteractionRepository;
}) {
 const [preferences,setPreferences]=React.useState(initial??defaultTrainingInteractions);
 const [loadStatus,setLoadStatus]=React.useState<Status>(initial?"ready":"loading");
 const [saveStatus,setSaveStatus]=React.useState<"idle"|"saving"|"error">("idle");
 const [attempt,setAttempt]=React.useState(0);
 const alive=React.useRef(false),pending=React.useRef(false),revision=React.useRef(0);
 React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 React.useEffect(()=>{
  let cancelled=false;
  const load=async()=>{
   if(pending.current)return;
   const version=revision.current;
   try {
    const value=await repository.load(userId);
    if(!cancelled&&version===revision.current){setPreferences(value);setLoadStatus("ready");}
   }catch{if(!cancelled&&version===revision.current)setLoadStatus("error");}
  };
  if(!initial)void load();
  const focus=()=>{if(!initial && document.visibilityState==="visible")void load();};
  window.addEventListener("focus",focus);document.addEventListener("visibilitychange",focus);
  return()=>{cancelled=true;window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",focus);};
 },[userId,repository,initial,attempt]);
 const save=async(value:TrainingInteractions)=>{
  if(loadStatus!=="ready"||pending.current)return;
  pending.current=true;revision.current++;setSaveStatus("saving");
  try {await repository.save(userId,value);if(alive.current){setPreferences(value);setSaveStatus("idle");}}
  catch {if(alive.current)setSaveStatus("error");}
  finally{pending.current=false;}
 };
 return <Context.Provider value={{preferences,save,loadStatus,saveStatus,reload:()=>{setLoadStatus("loading");setAttempt(v=>v+1);}}}>{children}</Context.Provider>;
}
