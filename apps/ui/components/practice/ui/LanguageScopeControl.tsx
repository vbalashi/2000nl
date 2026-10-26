"use client";
import React,{useLayoutEffect,useRef,useState} from "react";
import {ChevronDown} from "lucide-react";
import {SegmentedControl} from "./SegmentedControl";
import {ActionMenu} from "./ActionMenu";
import s from "./languageScopeControl.module.css";

/** Ordered, already eligible languages; narrowing the viewport never changes scope. */
export function LanguageScopeControl({label,menuLabel,language,options,value,onChange}:{
 label:string;menuLabel:string;language:string;options:{id:string;label:string}[];value:string;onChange:(id:string)=>void;
}){
 const root=useRef<HTMLDivElement>(null);
 const [capacity,setCapacity]=useState(4);
 const [remembered,setRemembered]=useState<string|null>(null);
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null);
 useLayoutEffect(()=>{
  const node=root.current;if(!node || typeof ResizeObserver==="undefined")return;
  const measure=()=>{
   if(!node.clientWidth)return;
   const widths=[...node.querySelectorAll<HTMLElement>("[data-language-measure]")].map(item=>item.getBoundingClientRect().width+20);
   let count=Math.min(4,options.length);
   while(count>1){const overflowing=options.length>count;const displayed=overflowing?[...widths.slice(0,count-1),Math.max(...widths.slice(count-1))]:widths.slice(0,count);const width=displayed.reduce((sum,width)=>sum+width,0)+Math.max(0,count-1)*3+(overflowing?31:0);if(width<=node.clientWidth)break;count--;}
   setCapacity(count);
  };
  const observer=new ResizeObserver(measure);observer.observe(node);measure();document.fonts?.ready.then(()=>{if(node.isConnected)measure();});return()=>observer.disconnect();
 },[options]);
 const overflow=options.length>capacity;
 const fixed=options.slice(0,overflow?Math.max(0,capacity-1):capacity);
 const rest=overflow?options.slice(Math.max(0,capacity-1)):[];
 const variable=rest.find(item=>item.id===value)??rest.find(item=>item.id===remembered)??rest[0];
 const close=React.useCallback(()=>{setAnchor(current=>{current?.focus({preventScroll:true});return null;});},[]);
 return <div ref={root} className={s.scope}>
  <div className={s.measure} aria-hidden="true">{options.map(item=><span data-language-measure key={item.id}>{item.label}</span>)}</div>
  <SegmentedControl standard label={label}>
   {fixed.map(item=><button type="button" key={item.id} aria-pressed={value===item.id} onClick={()=>onChange(item.id)}>{item.label}</button>)}
   {variable&&<button type="button" aria-pressed={value===variable.id} onClick={()=>onChange(variable.id)}>{variable.label}</button>}
   {overflow&&<button type="button" aria-label={menuLabel} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={event=>setAnchor(event.currentTarget)}><ChevronDown size={14} aria-hidden="true"/></button>}
  </SegmentedControl>
  {anchor&&<ActionMenu anchor={anchor} title={menuLabel} language={language} onClose={close} items={rest.map(item=>({id:item.id,label:item.label,onSelect:()=>{setRemembered(item.id);onChange(item.id);close();}}))}/>}
 </div>;
}
