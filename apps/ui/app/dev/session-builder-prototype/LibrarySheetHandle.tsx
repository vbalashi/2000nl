"use client";
import React,{useRef} from "react";
import s from "./library.module.css";
export function LibrarySheetHandle({expanded,onExpand,onCollapse,onClose,onDrag}:{expanded:boolean;onExpand:()=>void;onCollapse:()=>void;onClose:()=>void;onDrag:(offset:number)=>void}){
 const start=useRef<number|null>(null);const moved=useRef(false);
 return <button className={s.sheetHandle} aria-label={expanded?"Collapse word card":"Expand word card"} aria-expanded={expanded}
 onPointerDown={e=>{start.current=e.clientY;moved.current=false;e.currentTarget.setPointerCapture(e.pointerId);}}
 onPointerMove={e=>{if(start.current!==null)onDrag(start.current-e.clientY);}}
 onPointerUp={e=>{if(start.current===null)return;const distance=e.clientY-start.current;start.current=null;onDrag(0);moved.current=Math.abs(distance)>30;if(distance < -30)onExpand();else if(distance>30){if(expanded)onCollapse();else onClose();}}}
 onPointerCancel={()=>{start.current=null;onDrag(0);moved.current=true;}}
 onClick={()=>{if(moved.current){moved.current=false;return;}if(expanded)onCollapse();else onExpand();}}
 onKeyDown={e=>{if(e.key==="ArrowUp"){e.preventDefault();onExpand();}if(e.key==="ArrowDown"){e.preventDefault();onCollapse();}if(e.key==="Escape")onClose();}}><span/></button>;
}
