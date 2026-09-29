"use client";
import {useState} from "react";
import {Check, Trash2} from "lucide-react";
import {Action, Modal} from "./VariantControls";
import s from "./trainingHome.module.css";

export function SavedTrainingControls({name,main,hasOthers,onMain,onDelete}:{name:string;main:boolean;hasOthers:boolean;onMain:()=>void;onDelete:()=>void}){
 const [deleting,setDeleting]=useState(false);
 return <>
  <div className={s.savedControls}>
   <button className={s.makeMain} aria-pressed={main} disabled={main} onClick={onMain}>{main&&<Check size={15}/>} {main?"Main training":"Use as main training"}</button>
   <button className={s.delete} onClick={()=>setDeleting(true)}><Trash2 size={15}/> Delete training</button>
  </div>
  {deleting&&<Modal title="Delete training?" onClose={()=>setDeleting(false)}><div className={s.settings}><p>“{name}” will be removed from saved training. Your learning progress is kept.</p>{main&&hasOthers&&<p>The next saved training will become your main training.</p>}<div className={s.settingsActions}><Action onClick={()=>setDeleting(false)}>Cancel</Action><button className={s.confirmDelete} onClick={onDelete}>Delete training</button></div></div></Modal>}
 </>;
}
