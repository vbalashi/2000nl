"use client";

import React, {createContext, useContext, useEffect, useRef} from "react";
import {ArrowDown, Check, X} from "lucide-react";
import {Button, CheckboxCards, Dialog, IconButton, Slider} from "@radix-ui/themes";
import {Direction, toggleRequired} from "./model";
import {Variant} from "./variants";
import s from "./prototype.module.css";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import {IconAction} from "@/components/practice/ui/IconAction";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {getUiMessages} from "@/lib/uiMessages";

export const DesignContext=createContext<Variant>("current");
export const InterfaceLanguageContext=createContext<OnboardingLanguage>("en");
export function Choice({active,onClick,children}:{active:boolean;onClick:()=>void;children:React.ReactNode}) {
  const variant=useContext(DesignContext);
  if(variant==="radix")return <Button type="button" size="2" variant={active?"soft":"surface"} color={active?"violet":"gray"} aria-pressed={active} onClick={onClick}>{active && <Check size={13}/>} {children}</Button>;
  return <button type="button" className={`${s.choice} ${active?s.selected:""}`} aria-pressed={active} onClick={onClick}>{children}</button>;
}
export function Directions({values,pair,onChange,contentLanguage}:{values:Direction[];pair:string[];onChange:(directions:Direction[])=>void;contentLanguage?:string}) {
  const variant=useContext(DesignContext);
  const messages=getUiMessages(useContext(InterfaceLanguageContext));
  if(variant==="radix")return <CheckboxCards.Root aria-label={messages.builder.direction} size="1" columns="2" gap="3" value={values} onValueChange={next=>{if(next.length)onChange(next as Direction[]);}} className={s.radixDirections}>
    {(["Direct","Reverse"] as const).map(direction=><CheckboxCards.Item key={direction} value={direction}><span className={s.radixDirectionBody}><span className={s.radixDirectionTitle}>{messages.trainingOverview.direction[direction]}</span><strong lang={contentLanguage} className={s.prompt}>{pair[direction==="Direct"?0:1]}</strong><ArrowDown size={13}/><span lang={contentLanguage} className={s.answer}>{pair[direction==="Direct"?1:0]}</span></span></CheckboxCards.Item>)}
  </CheckboxCards.Root>;
  return <div className={s.directions}>{(["Direct","Reverse"] as const).map(direction=><button key={direction} className={`${s.direction} ${values.includes(direction)?s.directionSelected:""}`} aria-pressed={values.includes(direction)} onClick={()=>onChange(toggleRequired(values,direction))}>
    <span className={s.directionHeading}>{messages.trainingOverview.direction[direction]}<span className={s.check}>{values.includes(direction)&&<Check size={12}/>}</span></span>
    <strong lang={contentLanguage} className={s.prompt}>{pair[direction==="Direct"?0:1]}</strong><ArrowDown size={13} className={s.directionArrow}/><span lang={contentLanguage} className={s.answer}>{pair[direction==="Direct"?1:0]}</span>
  </button>)}</div>;
}
export function RangeControl({label,min,max,step=1,value,onChange}:{label:string;min:number;max:number;step?:number;value:number;onChange:(value:number)=>void}) {
  const variant=useContext(DesignContext);
  const sliderRef=useRef<HTMLSpanElement>(null);
  useEffect(()=>{sliderRef.current?.querySelector('[role="slider"]')?.setAttribute("aria-label",label);},[label,variant]);
  if(variant==="radix")return <Slider ref={sliderRef} aria-label={label} min={min} max={max} step={step} value={[value]} onValueChange={values=>onChange(values[0])} className={s.radixSlider}/>;
  return <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event=>onChange(Number(event.target.value))}/>;
}
export function Action({primary=false,children,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{primary?:boolean}) {
  const variant=useContext(DesignContext);
  if(variant==="radix")return <Button {...props} variant={primary?"solid":"surface"} color={primary?"violet":"gray"} size="2">{children}</Button>;
  return <button {...props} className={primary?s.primary:s.secondary}>{children}</button>;
}
function NativeModal({title,onClose,children,compact=false}:{title:string;onClose:()=>void;children:React.ReactNode;compact?:boolean}) {
  const language=useContext(InterfaceLanguageContext);
  return <DialogSurface lang={language} onDismiss={onClose} className={`${s.modal} ${compact?s.compactModal:""}`} aria-label={title}>
    <div className={s.modalHeader}><h2>{title}</h2><IconAction className={s.iconButton} label={getUiMessages(language).builder.closeDialog} onClick={onClose}><X size={20}/></IconAction></div>{children}
  </DialogSurface>;
}
export function Modal(props:{title:string;onClose:()=>void;children:React.ReactNode;compact?:boolean}) {
  const variant=useContext(DesignContext);
  const language=useContext(InterfaceLanguageContext);
  if(variant!=="radix")return <NativeModal {...props}/>;
  return <Dialog.Root open onOpenChange={open=>{if(!open)props.onClose();}}><Dialog.Content lang={language} aria-describedby={undefined} maxWidth={props.compact?"380px":"560px"} className={s.radixDialog}>
    <div className={s.modalHeader}><Dialog.Title mb="0" size="4">{props.title}</Dialog.Title><Dialog.Close><IconButton variant="ghost" color="gray" aria-label={getUiMessages(language).builder.closeDialog}><X size={18}/></IconButton></Dialog.Close></div>{props.children}
  </Dialog.Content></Dialog.Root>;
}
