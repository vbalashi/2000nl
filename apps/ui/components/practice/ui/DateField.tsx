"use client";

import React,{useEffect,useId,useRef,useState} from "react";
import {CalendarDays,ChevronLeft,ChevronRight} from "lucide-react";
import {DialogSurface} from "./DialogSurface";
import overlays from "../library/libraryOverlays.module.css";
import s from "./DateField.module.css";

type Labels={previousMonth:string;nextMonth:string;clear:string;cancel:string;year:string};
type Props={label:string;value:string;onChange:(value:string)=>void;locale:string;disabled?:boolean;labels:Labels};
const iso=(date:Date)=>`${String(date.getUTCFullYear()).padStart(4,"0")}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`;
const day=(year:number,month:number,date:number)=>{const result=new Date(0);result.setUTCFullYear(year,month,date);result.setUTCHours(12,0,0,0);return result;};
function parse(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const date=new Date(`${value}T12:00:00Z`);return Number.isFinite(date.getTime())&&iso(date)===value?date:null;}
function shiftMonth(value:Date,delta:number){const first=day(value.getUTCFullYear(),value.getUTCMonth()+delta,1);return day(first.getUTCFullYear(),first.getUTCMonth(),Math.min(value.getUTCDate(),day(first.getUTCFullYear(),first.getUTCMonth()+1,0).getUTCDate()));}

/** Optional ISO calendar date, displayed in the interface locale. No browser-owned calendar chrome. */
export function DateField({label,value,onChange,locale,disabled=false,labels}:Props){
 const [open,setOpen]=useState(false),id=useId();
 const selected=parse(value);
 return <div className={s.field}><span id={id}>{label}</span><button className={s.trigger} type="button" aria-labelledby={`${id} ${id}-value`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(true)}><span id={`${id}-value`}>{selected?new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone:"UTC"}).format(selected):"—"}</span><CalendarDays size={16} aria-hidden="true"/></button>
  {open&&!disabled&&<Calendar label={label} value={value} locale={locale} labels={labels} onClose={()=>setOpen(false)} onChange={next=>{onChange(next);setOpen(false);}}/>}
 </div>;
}
function Calendar({label,value,onChange,locale,labels,onClose}:Omit<Props,"disabled">&{onClose:()=>void}){
 const today=new Date(),initial=parse(value)??day(today.getFullYear(),today.getMonth(),today.getDate());
 const [focusDate,setFocusDate]=useState(initial),[month,setMonth]=useState(()=>day(initial.getUTCFullYear(),initial.getUTCMonth(),1));
 const grid=useRef<HTMLTableElement>(null);
 const year=month.getUTCFullYear(),monthIndex=month.getUTCMonth();
 const [yearText,setYearText]=useState(String(year));
 useEffect(()=>setYearText(String(year)),[year]);
 const commitYear=()=>{const next=Number(yearText);if(Number.isInteger(next)&&next>=1&&next<=9999){setMonth(day(next,monthIndex,1));setFocusDate(day(next,monthIndex,Math.min(focusDate.getUTCDate(),day(next,monthIndex+1,0).getUTCDate())));}else setYearText(String(year));};
 const firstWeekday=locale.startsWith("en")?0:1;
 const leading=(month.getUTCDay()-firstWeekday+7)%7,days=day(year,monthIndex+1,0).getUTCDate();
 const rows=Math.ceil((leading+days)/7);
 const formatter=new Intl.DateTimeFormat(locale,{dateStyle:"full",timeZone:"UTC"});
 const monthLabel=new Intl.DateTimeFormat(locale,{month:"long",timeZone:"UTC"}).format(month);
 const move=(next:Date)=>{if(next.getUTCFullYear()<1||next.getUTCFullYear()>9999)return;setFocusDate(next);setMonth(day(next.getUTCFullYear(),next.getUTCMonth(),1));};
 useEffect(()=>{grid.current?.querySelector<HTMLButtonElement>(`button[data-date="${iso(focusDate)}"]`)?.focus({preventScroll:true});},[focusDate]);
 const onKeyDown=(event:React.KeyboardEvent)=>{
  let next:Date|undefined;
  if(event.key==="ArrowLeft"||event.key==="ArrowRight")next=day(year,monthIndex,focusDate.getUTCDate()+(event.key==="ArrowLeft"?-1:1));
  if(event.key==="ArrowUp"||event.key==="ArrowDown")next=day(year,monthIndex,focusDate.getUTCDate()+(event.key==="ArrowUp"?-7:7));
  if(event.key==="Home"||event.key==="End"){const offset=(focusDate.getUTCDay()-firstWeekday+7)%7;next=day(year,monthIndex,focusDate.getUTCDate()+(event.key==="Home"?-offset:6-offset));}
  if(event.key==="PageUp"||event.key==="PageDown")next=shiftMonth(focusDate,(event.key==="PageUp"?-1:1)*(event.shiftKey?12:1));
  if(next){event.preventDefault();event.stopPropagation();move(next);}
 };
 return <DialogSurface className={`${overlays.dialog} ${s.calendar}`} aria-label={label} onDismiss={onClose}>
  <h2>{label}</h2><div className={s.navigation}><button type="button" aria-label={labels.previousMonth} disabled={year===1&&monthIndex===0} onClick={()=>move(shiftMonth(focusDate,-1))}><ChevronLeft size={18} aria-hidden="true"/></button><div className={s.month}><span aria-live="polite">{monthLabel}</span><input aria-label={labels.year} type="number" min={1} max={9999} value={yearText} onChange={event=>setYearText(event.target.value)} onBlur={commitYear} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();event.stopPropagation();event.currentTarget.blur();}}}/></div><button type="button" aria-label={labels.nextMonth} disabled={year===9999&&monthIndex===11} onClick={()=>move(shiftMonth(focusDate,1))}><ChevronRight size={18} aria-hidden="true"/></button></div>
  <table ref={grid} className={s.grid} role="grid" aria-label={new Intl.DateTimeFormat(locale,{month:"long",year:"numeric",timeZone:"UTC"}).format(month)} onKeyDown={onKeyDown}><thead><tr>{Array.from({length:7},(_,index)=>{const date=day(2024,0,7+firstWeekday+index);return <th scope="col" key={index} aria-label={new Intl.DateTimeFormat(locale,{weekday:"long",timeZone:"UTC"}).format(date)}>{new Intl.DateTimeFormat(locale,{weekday:"short",timeZone:"UTC"}).format(date)}</th>;})}</tr></thead><tbody>{Array.from({length:rows},(_,row)=><tr key={row}>{Array.from({length:7},(_,column)=>{const number=row*7+column-leading+1;if(number<1||number>days)return <td key={column}/>;const date=day(year,monthIndex,number),key=iso(date);return <td key={column} aria-selected={key===value}><button type="button" data-date={key} tabIndex={key===iso(focusDate)?0:-1} aria-label={formatter.format(date)} aria-current={key===iso(day(today.getFullYear(),today.getMonth(),today.getDate()))?"date":undefined} onClick={()=>onChange(key)}>{number}</button></td>;})}</tr>)}</tbody></table>
  <footer><button type="button" disabled={!value} onClick={()=>onChange("")}>{labels.clear}</button><button type="button" onClick={onClose}>{labels.cancel}</button></footer>
 </DialogSurface>;
}
