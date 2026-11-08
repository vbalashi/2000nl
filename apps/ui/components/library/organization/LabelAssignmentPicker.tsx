"use client";
import React,{useMemo,useState} from "react";
import {Folder,Search} from "lucide-react";
import {IconAction} from "@/components/practice/ui/IconAction";
import type {CollectionLabelsSnapshot} from "@/lib/collections/labels/model";
import {labelRows} from "@/lib/collections/labels/catalog";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {organizationCopy} from "./copy";
import s from "./organization.module.css";

/** Filtering changes visibility only; hidden assignments remain selected. */
export function LabelAssignmentPicker({snapshot,selected,onToggle,disabled=false,locale,name}:{snapshot:CollectionLabelsSnapshot|null;selected:string[];onToggle:(id:string)=>void;disabled?:boolean;locale:OnboardingLanguage;name?:string}){
 const [query,setQuery]=useState(""),[searchOpen,setSearchOpen]=useState(false);
 const t=organizationCopy(locale),rows=labelRows(snapshot,locale);
 const inherited=useMemo(()=>{
  const parents=new Map(snapshot?.labels.map(label=>[label.id,label.parent_id]));
  const result=new Set<string>();
  for(const id of selected){let parent=parents.get(id);while(parent&&!result.has(parent)){result.add(parent);parent=parents.get(parent);}}
  return result;
 },[snapshot,selected]);
 const normalized=query.trim().toLocaleLowerCase(locale);
 const visible=rows.filter(row=>row.path.toLocaleLowerCase(locale).includes(normalized));
 return <><div className={s.assignmentContext}>{name&&<p>{name}</p>}<IconAction label={t.searchLabels} title={t.searchLabels} aria-expanded={searchOpen} onClick={()=>{setSearchOpen(value=>!value);setQuery("");}}><Search size={18} aria-hidden="true"/></IconAction></div>
  {searchOpen&&<label className={`${s.search} ${s.assignmentSearch}`}><Search size={16} aria-hidden="true"/><input autoFocus type="search" aria-label={t.searchLabels} placeholder={t.searchLabels} value={query} onChange={event=>setQuery(event.target.value)}/></label>}
  <div className={s.assignmentList}>{visible.map(({label,depth,parents})=>{
   const checked=selected.includes(label.id),mixed=!checked&&inherited.has(label.id);
   return <label key={label.id} style={{paddingInlineStart:depth*12}}><input type="checkbox" ref={input=>{if(input)input.indeterminate=mixed;}} aria-checked={mixed?"mixed":checked} checked={checked} disabled={disabled} onChange={()=>onToggle(label.id)}/><Folder size={16}/><span>{label.name}{normalized&&parents?` · ${parents}`:""}</span></label>;
  })}{!visible.length&&<p>{rows.length?t.noResults:t.noLabels}</p>}</div>
 </>;
}
