"use client";
import {useEffect, type RefObject} from "react";
import {useTrainingInteractions} from "./TrainingInteractionPreferences";

/** Short downward strokes toggle existing translation only in non-scrolling card areas. */
export function useTranslationSwipe({root,enabled,onToggle}: {
 root:RefObject<HTMLElement>; enabled:boolean; onToggle:()=>void;
}) {
 const {preferences} = useTrainingInteractions();
 useEffect(() => {
  if(!enabled || !preferences.translationSwipe || !root.current)return;
  const shell=root.current.querySelector<HTMLElement>('[data-testid="training-sense-card-shell"]');
  if(!shell)return;
  let start:{x:number;y:number;time:number}|null=null;
  let tracking=false;
  const begin=(event:TouchEvent) => {
   start=null;tracking=false;
   if(event.touches.length!==1||!(event.target instanceof HTMLElement))return;
   if(event.target.closest("button,a,input,textarea,select,[role='button'],[contenteditable='true']"))return;
   // Never steal reading scroll from a long answer, even when it is at its top.
   for(let node:HTMLElement|null=event.target;node && node!==shell;node=node.parentElement){
    if(node.scrollHeight>node.clientHeight+2 && /auto|scroll/.test(getComputedStyle(node).overflowY))return;
   }
   const touch=event.touches[0]; start={x:touch.clientX,y:touch.clientY,time:Date.now()};
  };
  const move=(event:TouchEvent) => {
   if(!start)return;
   if(event.touches.length!==1){start=null;return;}
   const touch=event.touches[0],dx=touch.clientX-start.x,dy=touch.clientY-start.y;
   if(!tracking){
    if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
    if(dy<=0||dy<Math.abs(dx)*1.5){start=null;return;}
    tracking=true;
   }
   if(event.cancelable)event.preventDefault();
  };
  const end=(event:TouchEvent) => {
   const origin=start;start=null;
   if(!origin||!tracking||event.touches.length||Date.now()-origin.time>700)return;
   const touch=event.changedTouches[0];if(!touch)return;
   const dx=touch.clientX-origin.x,dy=touch.clientY-origin.y;
   if(dy>=40&&dy<=130&&Math.abs(dx)<25)onToggle();
  };
  const cancel=()=>{start=null;tracking=false;};
  shell.addEventListener("touchstart",begin,{passive:true});
  shell.addEventListener("touchmove",move,{passive:false});
  shell.addEventListener("touchend",end);
  shell.addEventListener("touchcancel",cancel);
  return()=>{shell.removeEventListener("touchstart",begin);shell.removeEventListener("touchmove",move);shell.removeEventListener("touchend",end);shell.removeEventListener("touchcancel",cancel);};
 },[root,enabled,preferences.translationSwipe,onToggle]);
}
