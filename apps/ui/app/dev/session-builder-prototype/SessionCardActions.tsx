"use client";
import React,{useCallback,useRef,useState} from "react";
import {ChevronDown,EyeOff,Flag} from "lucide-react";
import {CardActionMenu,CardReportDialog} from "./LibraryOverlays";
import s from "./trainingSession.module.css";

export type CardMark="known"|"excluded";
/** Prototype actions share the Library menus; reports never leave the preview. */
export function SessionCardActions({disabled,onMark,onNotice}:{disabled:boolean;onMark:(mark:CardMark)=>void;onNotice:(message:string)=>void}){
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null);
 const [report,setReport]=useState(false);
 const exclude=useRef<HTMLButtonElement>(null);
 const closeMenu=useCallback(()=>{setAnchor(null);exclude.current?.focus({preventScroll:true});},[]);
 return <div className={s.secondaryActions}>
  <button type="button" disabled={disabled} aria-haspopup="dialog" onClick={()=>setReport(true)}><Flag size={15}/>Report</button>
  <button type="button" ref={exclude} disabled={disabled} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={event=>setAnchor(anchor?null:event.currentTarget)}><EyeOff size={15}/>Exclude<ChevronDown size={12}/></button>
  {anchor&&<CardActionMenu anchor={anchor} includeReport={false} onClose={closeMenu} onAction={action=>{closeMenu();if(action!=="report")onMark(action);}}/>}
  {report&&<CardReportDialog onClose={()=>setReport(false)} onNotice={onNotice}/>}
 </div>;
}
