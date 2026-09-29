"use client";
import React, {useId, useRef, useState, useEffect, type ReactNode} from "react";
import {X} from "lucide-react";
import {DialogSurface} from "./DialogSurface";
import {IconAction} from "./IconAction";
import s from "./practicePanel.module.css";

/** Shared secondary destination. Native modality preserves focus and blocks grading behind it. */
export function PracticePanel({title,onClose,children,headless=false,onEntered}:{onEntered?:()=>void;title:string;headless?:boolean;onClose:()=>void;children:ReactNode|((dismiss:()=>void)=>ReactNode)}){
 const id=useId();
 const [closing,setClosing]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const closeStarted=useRef(false);
 const entered=useRef(false);
 const completeEntry=()=>{if(!entered.current&&!closeStarted.current){entered.current=true;onEntered?.();}};
 useEffect(()=>{if(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)completeEntry();});
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const dismiss=()=>{
  if(closeStarted.current)return;
  closeStarted.current=true;
  if(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches){onClose();return;}
  setClosing(true);timer.current=setTimeout(onClose,340);
 };
 return <DialogSurface className={s.panel} onAnimationEnd={event=>{if(event.target===event.currentTarget&&!event.nativeEvent.pseudoElement)completeEntry();}} data-closing={closing||undefined} aria-labelledby={headless?undefined:id} aria-label={headless?title:undefined} onDismiss={dismiss}>
  {!headless&&<header className={s.heading}><h2 id={id}>{title}</h2><IconAction label={`Close ${title.toLowerCase()}`} className={s.close} onClick={dismiss}><X size={19}/></IconAction></header>}
  <div className={s.body}>{typeof children==="function"?children(dismiss):children}</div>
 </DialogSurface>;
}
