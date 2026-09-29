"use client";
import React,{useState} from "react";
import catalog from "./languageCatalog.json";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import s from "./settings.module.css";
const localized=new Intl.DisplayNames(["ru"],{type:"language"});
const nativeAliases:Record<string,string>={krc:"къарачай тил малкъар тил карачаевский балкарский",zh:"中文 汉语 漢語 普通话",cmn:"中文 汉语 普通话",ar:"العربية",arb:"العربية",fa:"فارسی پارسی",pes:"فارسی"};
const normalize=(text:string)=>text.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase();
const searchable=catalog.map(item=>{const native=new Intl.DisplayNames([item.code],{type:"language"}).of(item.code)||"";const alias=localized.of(item.code)||"";return {...item,native,alias,search:normalize(`${item.name} ${item.codes.join(" ")} ${alias} ${native} ${nativeAliases[item.code]||""}`)};});
export function LanguagePicker({title,onChoose,onClose}:{title:string;onChoose:(name:string)=>void;onClose:()=>void}){
 const [query,setQuery]=useState("");const [limit,setLimit]=useState(60);
 const term=normalize(query.trim());
 const results=searchable.filter(item=>item.search.includes(term)).sort((a,b)=>Number(b.codes.includes(term))-Number(a.codes.includes(term)));
 return <DialogSurface onDismiss={onClose} className={s.picker} aria-label={title}><header><h2>{title}</h2><button aria-label="Close language selection" onClick={onClose}>×</button></header><input autoFocus aria-label="Search languages" placeholder="Search by language name or code…" value={query} onChange={e=>{setQuery(e.target.value);setLimit(60);}}/><p>{results.length.toLocaleString("en")} {results.length===1?"language":"languages"} · ISO 639-3</p><div className={s.pickerResults}>{results.slice(0,limit).map(item=><button key={item.code} onClick={()=>{onChoose(item.name);onClose();}}><span>{item.name}{item.native!==item.name&&item.native!==item.code&&<small className={s.nativeName}>{item.native}</small>}</span><small>{item.code}</small></button>)}{results.length===0&&<p>No matching languages.</p>}{results.length>limit&&<button onClick={()=>setLimit(v=>v+100)}>Show more</button>}</div><footer>Names and codes: SIL ISO 639-3. Translation quality varies by language.</footer></DialogSurface>;
}
