"use client";
import React, { useRef, useState } from "react";
import controls from "../builder/builderControls.module.css";
import s from "./vocabularySelection.module.css";
type Boundary = "from" | "to";
type Drag = { pointerId: number; boundary: Boundary | null; lower: number; upper: number; steps: number[]; left: number; width: number };
/** Native keyboard controls with one shared, touch-sized pointer surface.
 * Coincident thumbs separate in the direction of a drag; neither covers the other.
 */
export function FrequencyRange({from,to,steps,onChange,firstLabel,lastLabel,language}:{from:number;to:number;steps:number[];onChange:(from:number,to:number)=>void;firstLabel:string;lastLabel:string;language:string}) {
 const lowerInput=useRef<HTMLInputElement>(null),upperInput=useRef<HTMLInputElement>(null),drag=useRef<Drag|null>(null);
 const [dragging,setDragging]=useState(false);
 const displayedSteps=dragging&&drag.current?drag.current.steps:steps;
 const lower=displayedSteps.indexOf(from),upper=displayedSteps.indexOf(to),last=displayedSteps.length-1;
 const focus=(boundary:Boundary)=>(boundary==="from"?lowerInput:upperInput).current?.focus({preventScroll:true});
 const move=(clientX:number)=>{
  const current=drag.current;if(!current)return;
  const index=Math.max(0,Math.min(current.steps.length-1,Math.round((clientX-current.left-8)/Math.max(1,current.width-16)*(current.steps.length-1))));
  if(!current.boundary){if(index<current.lower)current.boundary="from";else if(index>current.upper)current.boundary="to";else return;}
  focus(current.boundary);
  if(current.boundary==="from")onChange(current.steps[Math.min(index,current.upper)],current.steps[current.upper]);
  else onChange(current.steps[current.lower],current.steps[Math.max(index,current.lower)]);
 };
 const finish=(event:React.PointerEvent<HTMLDivElement>)=>{if(drag.current?.pointerId!==event.pointerId)return;if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);drag.current=null;setDragging(false);};
 return <>
  <div className={s.dualRange} style={{"--range-start":`${lower/last*100}%`,"--range-end":`${upper/last*100}%`} as React.CSSProperties}
   onPointerDown={event=>{
    if(!event.isPrimary||event.button!==0)return;event.preventDefault();
    const rect=event.currentTarget.getBoundingClientRect(),position=(event.clientX-rect.left-8)/Math.max(1,rect.width-16)*last;
    const boundary=lower===upper?null:Math.abs(position-lower)<Math.abs(position-upper)?"from":"to";
    drag.current={pointerId:event.pointerId,boundary,lower,upper,steps:displayedSteps,left:rect.left,width:rect.width};setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);focus(boundary??"from");move(event.clientX);
   }} onPointerMove={event=>{if(drag.current?.pointerId===event.pointerId)move(event.clientX);}} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
   <div className={s.rail} aria-hidden="true"/>
   <input ref={lowerInput} className={s.rangeInput} type="range" min={0} max={upper} step={1} value={lower} aria-label={firstLabel} aria-valuetext={String(from)} onChange={event=>onChange(displayedSteps[Number(event.target.value)],to)}/>
   <span className={s.thumb} style={{left:`calc(${lower/last*100}% + ${8-16*lower/last}px)`}} aria-hidden="true"/>
   <input ref={upperInput} className={s.rangeInput} type="range" min={lower} max={last} step={1} value={upper} aria-label={lastLabel} aria-valuetext={String(to)} onChange={event=>onChange(from,displayedSteps[Number(event.target.value)])}/>
   <span className={s.thumb} style={{left:`calc(${upper/last*100}% + ${8-16*upper/last}px)`}} aria-hidden="true"/>
  </div>
  <div className={`${controls.sizeTicks} ${s.ticks} ${s.frequencyTicks}`} aria-hidden="true">{displayedSteps.map((rank,index)=>[1,100,1000,displayedSteps.at(-1)].includes(rank)&&<span key={rank} style={{left:`${index/last*100}%`}}>{rank.toLocaleString(language)}</span>)}</div>
 </>;
}
