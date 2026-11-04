"use client";
import React, {useEffect,useId,useRef,useState} from "react";
import {CircleHelp} from "lucide-react";
import s from "./settings.module.css";

export function SettingsHelp({label,text,hover=false}:{label:string;text:string;hover?:boolean}) {
 const id=useId(),timer=useRef<ReturnType<typeof setTimeout>>();
 const trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false);
 const cancelClose=()=>clearTimeout(timer.current);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const hide=()=>{cancelClose();popup.current?.hidePopover?.();setOpen(false);};
 const show=()=>{
  cancelClose();const box=trigger.current?.getBoundingClientRect(),panel=popup.current;
  if(!box||!panel||open)return;
  panel.style.left=`${Math.max(12,Math.min(box.left,window.innerWidth-316))}px`;
  panel.style.top="12px";panel.showPopover?.();setOpen(true);
  const height=panel.getBoundingClientRect().height;
  panel.style.top=`${box.bottom+8+height<window.innerHeight-12?box.bottom+8:Math.max(12,box.top-height-8)}px`;
 };
 const scheduleClose=()=>{cancelClose();timer.current=setTimeout(hide,180);};
 return <><button ref={trigger} type="button" className={s.help} aria-label={`? ${label}`} aria-expanded={open} aria-controls={id}
  onClick={()=>open?hide():show()}
  onPointerEnter={event=>{if(hover&&event.pointerType!=="touch")show();}}
  onPointerLeave={()=>{if(hover)scheduleClose();}}
  onFocus={event=>{if(hover&&event.currentTarget.matches(":focus-visible"))show();}}
  onBlur={()=>{if(hover)scheduleClose();}}
  onKeyDown={event=>{if(event.key==='Escape')hide();}}
 ><CircleHelp size={14} aria-hidden="true"/></button><div ref={popup} id={id} popover="auto" className={s.helpPopup}
  onPointerEnter={cancelClose} onPointerLeave={()=>{if(hover)scheduleClose();}}
  onToggle={event=>setOpen(event.newState==="open")}>{text}</div></>;
}
