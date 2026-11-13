"use client";
import React from "react";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {platformV2Message} from "@/lib/platform/platformV2ClientI18n";
import settings from "@/components/practice/settings/settings.module.css";
import chrome from "@/components/practice/article/senseChrome.module.css";
export type MeaningPosition = {ordinal:number; total:number};
/** Positioned in the actual headword box; em follows reading size and fit. */
export function MeaningIndicator({meaning,language,side="back"}:{meaning:MeaningPosition;language:OnboardingLanguage;side?:"front"|"back"|"history"}) {
 const [open,setOpen]=React.useState(false);
 const id=React.useId(), popup=React.useRef<HTMLSpanElement>(null);
 const label=platformV2Message(language,"ui.training.meaningPosition",meaning);
 const hint=platformV2Message(language,side === "front" ? "ui.training.meaningDetailsFrontHint" : "ui.training.meaningDetailsHint",{button:"{button}"}).split("{button}");
 React.useEffect(()=>{const hide=()=>{popup.current?.hidePopover?.();setOpen(false);};window.addEventListener("resize",hide);return()=>window.removeEventListener("resize",hide);},[]);
 if(meaning.total<=1 || meaning.ordinal<1 || meaning.ordinal>meaning.total)return null;
 return <span data-meaning-indicator style={{position:side === "history" ? "relative" : "absolute",left:side === "history" ? "auto" : "calc(100% + 8px)",top:side === "history" ? "auto" : "50%",transform:side === "history" ? "none" : "translateY(-50%)",marginLeft:side === "history" ? "8px" : undefined,display:side === "history" ? "inline-flex" : "flex",verticalAlign:side === "history" ? "middle" : undefined,fontSize:side === "history" ? "12px" : "0.354166667em",lineHeight:1,fontFamily:"sans-serif",letterSpacing:"normal",zIndex:10}}>
  <button type="button" aria-label={label} aria-expanded={open} aria-controls={id} aria-describedby={open?id:undefined} onClick={event=>{
   event.stopPropagation();const panel=popup.current;if(!panel)return;
   if(open){panel.hidePopover();return;}
   const r=event.currentTarget.getBoundingClientRect();
   panel.style.left="12px";panel.style.top="12px";
   panel.showPopover();const {height,width}=panel.getBoundingClientRect();
   panel.style.left=`${Math.max(12,Math.min(r.left,window.innerWidth-width-12))}px`;
   panel.style.top=`${r.bottom+8+height<window.innerHeight-12?r.bottom+8:Math.max(12,r.top-height-8)}px`;
  }} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){popup.current?.hidePopover();setOpen(false);}}} className="border border-slate-400 text-slate-500 dark:border-slate-500 dark:text-slate-400" style={{display:"flex",alignItems:"center",justifyContent:"center",width:"1em",height:"1em",borderRadius:"50%",background:"transparent",fontSize:"inherit",padding:0,lineHeight:1}}><svg aria-hidden="true" viewBox="0 0 100 100" style={{display:"block",width:"100%",height:"100%",overflow:"visible"}}><text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill="currentColor" style={{fontFamily:"Arial, sans-serif",fontSize:meaning.ordinal > 9 ? 48 : 59,fontWeight:400}}>{meaning.ordinal}</text></svg></button>
  <span ref={popup} id={id} role="tooltip" popover="auto" className={settings.helpPopup} onToggle={event=>setOpen(event.newState==="open")} style={{...(side === "history" ? {width:"max-content",maxWidth:"min(304px, calc(100vw - 24px))"} : {}),letterSpacing:"normal",textAlign:"left",whiteSpace:"normal",overflowWrap:"normal",wordBreak:"normal",textTransform:"none"}}>
   <span style={{display:"block"}}>{label}</span>
   {side !== "history" && <span style={{display:"block",marginTop:12}}>{hint[0]}<span role="img" aria-label={platformV2Message(language,"senseCard.wordDetails.open")} className={chrome.iconAction} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:18,height:18,verticalAlign:"-4px",margin:"0 2px",pointerEvents:"none",color:"inherit"}}><svg aria-hidden="true" viewBox="0 0 18 18" width="14" height="14" style={{display:"block",flexShrink:0}}><circle cx="5.5" cy="9" r="0.65" fill="currentColor"/><circle cx="9" cy="9" r="0.65" fill="currentColor"/><circle cx="12.5" cy="9" r="0.65" fill="currentColor"/></svg></span>{hint[1]}</span>}
  </span>
 </span>;
}
