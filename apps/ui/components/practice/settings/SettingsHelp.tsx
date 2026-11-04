"use client";
import React, {useId, useState} from "react";
import {CircleHelp} from "lucide-react";
import s from "./settings.module.css";

export function SettingsHelp({label,text}:{label:string;text:string}) {
 const id=useId();
 const [open,setOpen]=useState(false);
 return <><button type="button" className={s.help} aria-label={`? ${label}`} aria-expanded={open} aria-controls={id} onClick={event=>{
  const box=event.currentTarget.getBoundingClientRect(), popup=document.getElementById(id);
  if(!popup)return;
  if(open){popup.hidePopover?.();setOpen(false);return;}
  popup.style.left=`${Math.max(12,Math.min(box.left,window.innerWidth-316))}px`;
  popup.style.top="12px";
  popup.showPopover?.();
  setOpen(true);
  const height=popup.getBoundingClientRect().height;
  popup.style.top=`${box.bottom+8+height<window.innerHeight-12?box.bottom+8:Math.max(12,box.top-height-8)}px`;
 }}><CircleHelp size={14} aria-hidden="true"/></button><div id={id} popover="auto" className={s.helpPopup} onToggle={event=>setOpen(event.newState==="open")}>{text}</div></>;
}
