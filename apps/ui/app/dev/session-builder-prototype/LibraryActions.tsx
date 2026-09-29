"use client";
import React, { useCallback, useRef, useState } from "react";
import { List, EyeOff, Flag, MoreHorizontal, ChevronDown } from "lucide-react";
import { TrainingCardReviewButton } from "@/components/training/v2/TrainingCardTemplates";
import {IconAction} from "@/components/practice/ui/IconAction";
import type { LibraryStudy } from "./libraryStudy";
import s from "./library.module.css";
import {CardActionMenu,CollectionPicker,CardReportDialog,useCollections} from "./LibraryOverlays";
export type DemoLearningState = "new" | "learning" | "known" | "excluded";
export function LibraryButton({ children, primary = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button type="button" {...props} className={`${s.button} ${primary ? s.primary : ""} ${props.className || ""}`}>{children}</button>;
}
export function LibraryIconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <IconAction {...props} label={label} title={label} className={`${s.iconButton} ${props.className || ""}`}>{children}</IconAction>;
}
export function MeaningActions({ cardId, study, state, onState, onNotice }: { cardId:string; study: LibraryStudy; state: DemoLearningState; onState: (s: DemoLearningState) => void; onNotice: (s: string) => void }) {
  const [panel,setPanel]=useState<"collections"|"report"|null>(null);
  const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null);
  const {catalog,create,memberships,toggle,add}=useCollections();
  const selected=memberships[cardId]||[];
  const [rating,setRating]=useState("");
  const trigger=useRef<HTMLButtonElement|null>(null);
  const closeMenu=useCallback(()=>{setAnchor(null);trigger.current?.focus();},[]);
  function close(){setPanel(null);requestAnimationFrame(()=>trigger.current?.focus());}
  function open(next:"collections"|"report",button:HTMLButtonElement){trigger.current=button;setPanel(next);}
  function more(button:HTMLButtonElement){trigger.current=button;setAnchor(anchor?null:button);}
  function action(next:"report"|"known"|"excluded"){closeMenu();if(next==="report")setPanel("report");else{onState(next);onNotice(`${next==="known"?"Marked as known":"Excluded"} · local demo only`);}}
  return <div className={s.actionGroup} data-grouping={study.actions} data-rating-ink={study.ratingInk} data-learn-width={study.learnWidth}>
    <div className={s.actions}>
      {state==="known"||state==="excluded"?<LibraryButton onClick={()=>onState("new")}>Undo {state==="known"?"known":"exclusion"}</LibraryButton>:study.scene==="review"?<div className={s.reviewButtons} aria-label="Review ratings">{([["fail","Again"],["hard","Hard"],["success","Good"],["easy","Easy"]] as const).map(([result,label])=><TrainingCardReviewButton key={result} result={result} label={label} busy={false} onClick={()=>{setRating(label);onNotice(`${label} · demo rating, no review recorded`);}}/>)}</div>:<LibraryButton primary onClick={()=>{if(state==="new"){onState("learning");onNotice("Added to learning · local demo only");}else onNotice("Train next · no session started");}}>{state==="new"?"Learn":"Train next"}</LibraryButton>}
    </div>
    <div className={s.secondaryActions}>
      <button aria-haspopup="dialog" onClick={e=>open("collections",e.currentTarget)}><List size={14}/>Collections · {selected.length}</button>
      {study.actions==="toolbar"?<button aria-label="More card actions" aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={e=>more(e.currentTarget)}><MoreHorizontal size={18}/></button>:<><button className={s.reportAction} aria-label="Report" title="Report" onClick={e=>open("report",e.currentTarget)}><Flag size={13}/><span>Report</span></button><button aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={e=>more(e.currentTarget)}><EyeOff size={14}/>Exclude<ChevronDown size={12}/></button></>}
    </div>
    {anchor&&<CardActionMenu anchor={anchor} onClose={closeMenu} onAction={action}/>}
    {panel==="collections"&&<CollectionPicker catalog={catalog} selected={selected} onToggle={id=>toggle(cardId,id)} onCreate={name=>{const id=create(name);add(cardId,id);}} onClose={close}/>}
    {panel==="report"&&<CardReportDialog onClose={close} onNotice={onNotice}/>}
    {rating&&study.scene==="review"&&<small className={s.ratingFeedback} role="status">{rating} · demo only</small>}
  </div>;
}
