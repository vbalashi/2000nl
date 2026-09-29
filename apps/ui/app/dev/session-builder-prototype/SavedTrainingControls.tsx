"use client";
import React,{useContext,useState} from "react";
import {Check, Trash2} from "lucide-react";
import {Action, InterfaceLanguageContext, Modal} from "./VariantControls";
import {formatUiMessage,getUiMessages} from "@/lib/uiMessages";
import s from "./trainingHome.module.css";

export function SavedTrainingControls({name,main,hasOthers,onMain,onDelete}:{name:string;main:boolean;hasOthers:boolean;onMain:()=>void;onDelete:()=>void}){
 const [deleting,setDeleting]=useState(false);
 const copy=getUiMessages(useContext(InterfaceLanguageContext)).builder;
 return <>
  <div className={s.savedControls}>
   <button className={s.makeMain} aria-pressed={main} disabled={main} onClick={onMain}>{main&&<Check size={15}/>} {main?copy.mainTraining:copy.makeMain}</button>
   <button className={s.delete} onClick={()=>setDeleting(true)}><Trash2 size={15}/> {copy.delete}</button>
  </div>
  {deleting&&<Modal title={copy.deleteTitle} onClose={()=>setDeleting(false)}><div className={s.settings}><p>{formatUiMessage(copy.deleteNotice,{name})}</p>{main&&hasOthers&&<p>{copy.nextMain}</p>}<div className={s.settingsActions}><Action onClick={()=>setDeleting(false)}>{copy.cancel}</Action><button className={s.confirmDelete} onClick={onDelete}>{copy.delete}</button></div></div></Modal>}
 </>;
}
