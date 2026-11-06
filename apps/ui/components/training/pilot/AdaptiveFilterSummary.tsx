"use client";
import styles from "./adaptiveFilterSummary.module.css";
import React,{useLayoutEffect,useRef,useState} from "react";

export function AdaptiveFilterSummary({parts,shortParts,suffix,suffixIcon,meaning,meaningIcon,lines,accessibleParts,accessibleSuffix}:{parts:string;shortParts:string;suffix?:string;suffixIcon?:React.ReactNode;meaning?:string;meaningIcon?:React.ReactNode;lines:1|2;accessibleParts?:string;accessibleSuffix?:string}){
 const ref=useRef<HTMLSpanElement>(null),probe=useRef<HTMLSpanElement>(null),[short,setShort]=useState(false);
 useLayoutEffect(()=>{
  const node=ref.current, sample=probe.current;if(!node||!sample)return;
  let active=true;
  const measure=()=>{if(!active)return;const style=getComputedStyle(node);const height=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.5;setShort(sample.getBoundingClientRect().height>height*lines+1)};
  const observer=new ResizeObserver(measure);observer.observe(node);observer.observe(sample);measure();document.fonts?.ready.then(measure);
  return()=>{active=false;observer.disconnect()};
 },[parts,suffix,meaning,lines,suffixIcon,meaningIcon]);
 const description=[accessibleParts??parts,accessibleSuffix??suffix].filter(Boolean).join(" · ");
 const content=(value:string)=><>{value}{suffix&&<> · {suffixIcon&&<span className={styles.icon}>{suffixIcon}</span>}{suffix}</>}{meaning&&<> · {meaningIcon&&<span className={styles.icon}>{meaningIcon}</span>}{meaning}</>}</>;
 return <span className={styles.summary} ref={ref} title={description}>
  <span className={styles.probe} ref={probe} aria-hidden="true">{content(parts)}</span>
  <span aria-hidden="true">{content(short?shortParts:parts)}</span>
  <span className={styles.visuallyHidden}>{description}</span>
 </span>;
}
