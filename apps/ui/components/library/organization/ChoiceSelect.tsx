"use client";
import React,{useState} from "react";
import {Check,ChevronDown} from "lucide-react";
import {ActionMenu} from "@/components/practice/ui/ActionMenu";
import s from "./organization.module.css";
/** Catalog choices use the same keyboard-aware popover as other app choices. */
export function ChoiceSelect({label,value,options,onChange,disabled=false,locale}:{label:string;value:string;options:{id:string;label:string}[];onChange:(id:string)=>void;disabled?:boolean;locale:string}){
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null);
 const close=()=>{anchor?.focus({preventScroll:true});setAnchor(null);};
 return <div className={s.choiceField}><span>{label}</span><button type="button" className={s.choiceSelect} aria-label={`${label}: ${options.find(option=>option.id===value)?.label??""}`} aria-haspopup="menu" aria-expanded={Boolean(anchor)} disabled={disabled} onClick={event=>setAnchor(event.currentTarget)}><span>{options.find(option=>option.id===value)?.label}</span><ChevronDown size={16} aria-hidden="true"/></button>{anchor&&<ActionMenu anchor={anchor} title={label} language={locale} onClose={close} items={options.map(option=>({...option,checked:option.id===value,trailingIcon:option.id===value?<Check size={16} aria-hidden="true"/>:undefined,onSelect:()=>{onChange(option.id);close();}}))}/>}</div>;
}
