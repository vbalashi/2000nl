"use client";
import React, { useEffect, useRef } from "react";
import s from "./vocabularySelection.module.css";

/** Comparison-only wheel: bounded arithmetic, not a DOM list of thousands of ranks. */
export function NumberWheel({value,min,max,step,label,language,onChange,describedBy}:{value:number;min:number;max:number;step:number;label:string;language:string;onChange:(value:number)=>void;describedBy:string}){
 const ref=useRef<HTMLDivElement>(null),remainder=useRef(0);
 const gesture=useRef<{id:number;y:number;value:number;moved:boolean}|null>(null);
 const clamp=(next:number)=>Math.max(min,Math.min(max,next));
 const update=useRef({value,step,onChange,clamp});update.current={value,step,onChange,clamp};
 useEffect(()=>{
  const node=ref.current;if(!node)return;
  const wheel=(event:WheelEvent)=>{
   if(event.ctrlKey)return;
   event.preventDefault();
   remainder.current+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?160:1);
   const ticks=Math.trunc(remainder.current/32);if(!ticks)return;
   remainder.current-=ticks*32;
   const current=update.current;current.onChange(current.clamp(current.value+ticks*current.step));
  };
  const reset=()=>{remainder.current=0;};
  node.addEventListener("wheel",wheel,{passive:false});node.addEventListener("pointerleave",reset);
  return()=>{node.removeEventListener("wheel",wheel);node.removeEventListener("pointerleave",reset);};
 },[]);
 return <div ref={ref} className={s.wheel} role="spinbutton" tabIndex={0} aria-label={label} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} aria-describedby={describedBy}
  onKeyDown={event=>{
   const delta=event.key==="ArrowUp"?step:event.key==="ArrowDown"?-step:event.key==="PageUp"?step*10:event.key==="PageDown"?-step*10:null;
   if(delta!==null){event.preventDefault();onChange(clamp(value+delta));}
   else if(event.key==="Home"||event.key==="End"){event.preventDefault();onChange(event.key==="Home"?min:max);}
  }}
  onPointerDown={event=>{if(!event.isPrimary||event.button!==0)return;event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);gesture.current={id:event.pointerId,y:event.clientY,value,moved:false};}}
  onPointerMove={event=>{const start=gesture.current;if(!start||start.id!==event.pointerId)return;const distance=start.y-event.clientY;if(Math.abs(distance)>6)start.moved=true;if(start.moved)onChange(clamp(start.value+Math.trunc(distance/32)*step));}}
  onPointerUp={event=>{
   const start=gesture.current;if(!start||start.id!==event.pointerId)return;
   if(!start.moved){const box=event.currentTarget.getBoundingClientRect();const offset=Math.max(-2,Math.min(2,Math.floor((event.clientY-box.top)/32)-2));onChange(clamp(start.value+offset*step));}
   gesture.current=null;
   if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }} onPointerCancel={()=>{gesture.current=null;}} onLostPointerCapture={()=>{gesture.current=null;}}>
  {[-2,-1,0,1,2].map(offset=>{const number=value+offset*step;return <span aria-hidden="true" key={offset} className={offset===0?s.wheelCurrent:undefined}>{number>=min&&number<=max?number.toLocaleString(language):"\u00a0"}</span>;})}
 </div>;
}
