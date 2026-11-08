"use client";
import React,{useMemo,useState} from "react";
import {Folder,Check,Minus} from "lucide-react";
import {SearchField} from "@/components/practice/ui/SearchField";
import type {CollectionLabelsSnapshot} from "@/lib/collections/labels/model";
import {labelRows} from "@/lib/collections/labels/catalog";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {organizationCopy} from "./copy";
import s from "./organization.module.css";

/** Filtering changes visibility only; hidden assignments remain selected. */
export function LabelAssignmentPicker({snapshot,selected,onToggle,disabled=false,locale,createAction}:{snapshot:CollectionLabelsSnapshot|null;selected:string[];onToggle:(id:string)=>void;disabled?:boolean;locale:OnboardingLanguage;name?:string;createAction?:React.ReactNode}){
 const [query,setQuery]=useState("");
 const t=organizationCopy(locale),rows=labelRows(snapshot,locale);
 const inherited=useMemo(()=>{
  const parents=new Map(snapshot?.labels.map(label=>[label.id,label.parent_id]));
  const result=new Set<string>();
  for(const id of selected){let parent=parents.get(id);while(parent&&!result.has(parent)){result.add(parent);parent=parents.get(parent);}}
  return result;
 },[snapshot,selected]);
 const normalized=query.trim().toLocaleLowerCase(locale);
 const visible=rows.filter(row=>row.path.toLocaleLowerCase(locale).includes(normalized));
 return <><div className={s.assignmentToolbar}><SearchField><input type="search" aria-label={t.searchLabels} placeholder={t.searchLabels} value={query} onChange={event=>setQuery(event.target.value)}/></SearchField>{createAction}</div>
  <div className={s.assignmentList}>{visible.map(({label,depth,parents})=>{
   const checked=selected.includes(label.id),mixed=!checked&&inherited.has(label.id);
   return <button type="button" role="checkbox" aria-checked={mixed?"mixed":checked} key={label.id} style={{paddingInlineStart:12+depth*12}} disabled={disabled} onClick={()=>onToggle(label.id)}><Folder size={16} aria-hidden="true"/><span>{label.name}{normalized&&parents?` · ${parents}`:""}</span>{checked?<Check size={16} aria-hidden="true"/>:mixed?<Minus size={16} aria-hidden="true"/>:<span className={s.selectionSpace} aria-hidden="true"/>}</button>;
  })}{!visible.length&&<p>{rows.length?t.noLabelsFound:t.noLabels}</p>}</div>
 </>;
}
