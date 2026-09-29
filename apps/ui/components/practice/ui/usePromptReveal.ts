"use client";

import {useLayoutEffect, useRef, useState, type RefObject} from "react";

/** Move the same question to its answer-side position before revealing the details. */
export function usePromptReveal(heading:RefObject<HTMLElement>,revealed:boolean){
 const before=useRef<DOMRect|null>(null);
 const [moving,setMoving]=useState(false);
 function capture(){before.current=heading.current?.getBoundingClientRect()??null;}
 useLayoutEffect(()=>{
  const node=heading.current,from=before.current;
  if(!revealed||!node||!from){setMoving(false);return;}
  before.current=null;
  node.focus({preventScroll:true});
  if(!node.animate||window.matchMedia?.("(prefers-reduced-motion: reduce)").matches){setMoving(false);return;}
  const to=node.getBoundingClientRect();
  setMoving(true);
  const animation=node.animate([
   {transform:`translate(${from.left-to.left}px,${from.top-to.top}px)`},
   {transform:"translate(0,0)"},
  ],{duration:420,fill:"backwards",easing:"cubic-bezier(.22,1,.36,1)"});
  animation.onfinish=()=>setMoving(false);
  return()=>{animation.onfinish=null;animation.cancel();};
 },[revealed,heading]);
 useLayoutEffect(()=>{
  if(revealed&&!moving&&document.activeElement===document.body)heading.current?.focus({preventScroll:true});
 },[revealed,moving,heading]);
 return {capture,moving};
}
