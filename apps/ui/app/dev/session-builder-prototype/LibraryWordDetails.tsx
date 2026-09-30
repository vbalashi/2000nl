"use client";
import React, { useContext, useId, useState, type ReactNode } from "react";
import { ArrowLeftRight, ChevronDown, Link2 } from "lucide-react";
import { SenseCardReveal } from "@/components/training/SenseCardChrome";
import type { LibrarySenseCardGroupModel } from "@/components/training/library-v2/librarySenseCardModel";
import fixture from "./word-details-fixture.json";
import {getUiMessages,formatUiMessage} from "@/lib/uiMessages";
import {InterfaceLanguageContext} from "./VariantControls";
import s from "./wordDetails.module.css";

// Canonical VanDale records for this local visual prototype.
export const detailGroups = fixture.groups as LibrarySenseCardGroupModel[];
type Form = {label:string;value:string};
type Detail = {forms:Form[];conjugation:Record<string,Record<string,string>>;pos:string;relations:Record<string,{synonyms?:string[];antonyms?:string[]}>};
const details:Record<string,Detail> = fixture.details;
const relationsByEntry=Object.fromEntries(Object.values(details).flatMap(detail=>Object.entries(detail.relations)));
function unique(values:string[]){return [...new Set(values.map(v=>v.trim()).filter(Boolean))];}
function formValues(detail:Detail){return Object.fromEntries(detail.forms.map(f=>[f.label,f.value]));}
function headline(detail:Detail, variant:"primary"|"complete"):{values:string[];label?:string}{
 const f=formValues(detail);let keys:string[];let fallback:string[]=[];
 switch(detail.pos){
  case "zn": keys=variant==="primary"?["Plural","Diminutive"]:["Plural","Diminutive","Alternate headword","Derivation"];fallback=["Diminutive"];break;
  case "ww": keys=variant==="primary"?["Principal forms"]:["Principal forms","Derivation"];break;
  case "bn": keys=variant==="primary"?(f.Comparative||f.Superlative?["Comparative","Superlative"]:["Inflected form"]):["Inflected form","Comparative","Superlative","Derivation"];break;
  case "bw": case "tw": keys=["Comparative","Superlative"];break;
  case "afk": keys=["Plural","Diminutive"];break;
  default: keys=[];
 }
 let values=unique(keys.flatMap(key=>f[key]?[f[key]]:[]));
 if(!values.length&&fallback.length)values=unique(fallback.flatMap(key=>f[key]?[f[key]]:[]));
 if(detail.pos==="ww"&&!values.length){
  // Defensive fallback when a future verb has only conjugation data.
  const past=unique(Object.values(detail.conjugation.past||{}));
  const perfect=detail.conjugation.perfect;
  values.push(...past.slice(0,1));
  if(perfect){const phrase=[perfect.auxiliary,perfect.participle].filter(Boolean).join(" ");if(phrase)values.push(phrase);}
  if(!values.length)values.push(...unique(Object.values(detail.conjugation.present||{})).slice(0,2));
 }
 let label:string|undefined;
 if(!values.length&&["zn","ww","bn"].includes(detail.pos)){
  values=unique([...(f.Derivation?[f.Derivation]:[]),...(f["Alternate headword"]?[f["Alternate headword"]]:[])]);
  if(values.length)label="Related";
 }
 if(variant==="complete"&&label)values=unique(detail.forms.map(form=>form.value));
 return {values,label};
}
type FormsProps={model:LibrarySenseCardGroupModel;variant?:"primary"|"complete";part:"summary"|"body";open:boolean;onToggle:()=>void;id:string};
export function WordForms({model,variant="primary",part,open,onToggle,id}:FormsProps){
 const locale=useContext(InterfaceLanguageContext);const copy=getUiMessages(locale).wordDetails;
 const labelOf=(label:string)=>copy.forms[label as keyof typeof copy.forms]??label;
 const detail=details[`${model.headword}-${model.partOfSpeech}`];if(!detail)return null;
 const lead=headline(detail,variant);const shown=lead.values;if(!shown.length)return null;
 const f=formValues(detail);const covered=new Set(shown.flatMap(v=>v.split(/[,·]/).map(x=>x.trim())));
 const extra=detail.forms.filter(form=>!form.value.split(/[,·]/).every(v=>covered.has(v.trim())));
 const table=detail.conjugation||{};
 const perfect=table.perfect?[table.perfect.auxiliary,table.perfect.participle].filter(Boolean).join(" "):"";
 const perfectIsAlreadyShown=perfect&&[...covered].some(v=>v.toLocaleLowerCase()===perfect.toLocaleLowerCase());
 const showPerfect=Boolean(perfect&&!perfectIsAlreadyShown);
 const persons=unique([...Object.keys(table.present||{}),...Object.keys(table.past||{})]);
 // Aggregate perfect is already in the verb's one-line preview; avoid repeating it below.
 const hasDetails=extra.length>0||persons.length>0||showPerfect;
 const named=shown.flatMap(value=>{
  const form=detail.forms.find(item=>item.value===value);
  if(form?.label==="Principal forms"){
   const parts=value.split(/,\s*/).filter(Boolean);
   if(parts.length===2)return [{label:"Past",value:parts[0]},{label:"Perfect",value:parts[1]}];
  }
  const inferredVerbLabel=detail.pos==="ww"&&!form
   ? Object.values(detail.conjugation.past||{}).includes(value)?"Past"
    :[detail.conjugation.perfect?.auxiliary,detail.conjugation.perfect?.participle].filter(Boolean).join(" ")===value?"Perfect"
    :Object.values(detail.conjugation.present||{}).includes(value)?"Present":undefined
   :undefined;
  const label=lead.label||form?.label||inferredVerbLabel||"Form";
  return [{label:label==="Inflected form"?"Inflected":label,value}];
 });
 const line=<span className={s.formItems}>{named.map(({label,value},index)=><span className={s.formItem} key={`${label}-${index}`}><span className={s.formKind}>{labelOf(label)}</span><span className={s.formLine} lang="nl">{value}</span></span>)}</span>;
 if(part==="summary")return <div className={s.forms} aria-label={formatUiMessage(copy.formsOf,{word:model.headword})}>
  {hasDetails?<button className={s.formToggle} aria-label={formatUiMessage(open?copy.hideForms:copy.showForms,{word:model.headword})} aria-expanded={open} aria-controls={id} onClick={onToggle}>{line}<ChevronDown size={16} className={open?s.rotated:undefined}/></button>:line}
 </div>;
 if(!hasDetails)return null;
 return <SenseCardReveal open={open}><div id={id} inert={!open} aria-hidden={!open} className={s.expandedForms}>
   {(extra.length>0||showPerfect)&&<dl className={s.facts}>{extra.map(f=><div key={f.label}><dt>{labelOf(f.label)}</dt><dd lang="nl">{f.value}</dd></div>)}{showPerfect&&<div><dt>{copy.forms.Perfect}</dt><dd lang="nl">{perfect}</dd></div>}</dl>}
   {persons.length>0&&<table className={s.table} aria-label={formatUiMessage(copy.verbForms,{word:model.headword})}><thead><tr><th scope="col">{copy.person}</th><th scope="col">{copy.forms.Present}</th><th scope="col">{copy.forms.Past}</th></tr></thead><tbody>{persons.map(person=><tr key={person}><th scope="row" lang="nl">{person.replaceAll("_"," / ")}</th><td lang="nl">{table.present?.[person]||"—"}</td><td lang="nl">{table.past?.[person]||"—"}</td></tr>)}</tbody></table>}
  </div></SenseCardReveal>;
}

function Disclosure({label,children}:{label:string;children:ReactNode}) {
 const [open,setOpen]=useState(false);const id=useId();
 return <div className={s.disclosure} data-open={open}>
  <button className={s.toggle} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}><span>{label}</span><ChevronDown size={14} className={open?s.rotated:undefined}/></button>
  <SenseCardReveal open={open}><div id={id} inert={!open} aria-hidden={!open} className={s.body}>{children}</div></SenseCardReveal>
 </div>;
}
export function SenseRelations({entryId,compact=false}:{entryId:string;compact?:boolean}) {
 const copy=getUiMessages(useContext(InterfaceLanguageContext)).wordDetails;
 const relation=relationsByEntry[entryId];
 const groups=[{id:"synonyms",label:copy.synonyms,values:relation?.synonyms||[]},{id:"antonyms",label:copy.antonyms,values:relation?.antonyms||[]}].filter(g=>g.values.length);
 if(!groups.length)return null;
 const content=<div className={s.relations}>{groups.map(g=><div className={s.relationGroup} data-kind={g.id} key={g.id}><h3>{g.id==="synonyms"?<Link2 size={12}/>:<ArrowLeftRight size={12}/>}<span>{g.label}</span></h3><p lang="nl">{g.values.join(" · ")}</p></div>)}</div>;
 return <section aria-label={copy.relations} className={s.sense}>{compact?<Disclosure label={groups.map(g=>g.label).join(" · ")}>{content}</Disclosure>:content}</section>;
}
