"use client";
import React,{useContext,useState} from "react";
import {getUiMessages,formatUiCount} from "@/lib/uiMessages";
import {InterfaceLanguageContext} from "./VariantControls";
import {previewLanguageName} from "./previewLanguage";
import catalog from "./languageCatalog.json";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import s from "./settings.module.css";
const displayNames=["en","nl","ru"].map(locale=>new Intl.DisplayNames([locale],{type:"language"}));
const nativeAliases:Record<string,string>={krc:"къарачай тил малкъар тил карачаевский балкарский",zh:"中文 汉语 漢語 普通话",cmn:"中文 汉语 普通话",ar:"العربية",arb:"العربية",fa:"فارسی پارسی",pes:"فارسی"};
const normalize=(text:string)=>text.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase();
const searchable=catalog.map(item=>{const native=new Intl.DisplayNames([item.code],{type:"language"}).of(item.code)||"";const names=displayNames.map(display=>display.of(item.code)||"").join(" ");return {...item,native,search:normalize(`${item.name} ${item.codes.join(" ")} ${names} ${native} ${nativeAliases[item.code]||""}`)};});
export function LanguagePicker({title,onChoose,onClose}:{title:string;onChoose:(name:string)=>void;onClose:()=>void}){
 const locale=useContext(InterfaceLanguageContext);const copy=getUiMessages(locale).languagePicker;
 const [query,setQuery]=useState("");const [limit,setLimit]=useState(60);
 const term=normalize(query.trim());
 const results=searchable.filter(item=>item.search.includes(term)).sort((a,b)=>Number(b.codes.includes(term))-Number(a.codes.includes(term)));
 return <DialogSurface onDismiss={onClose} className={s.picker} aria-label={title} lang={locale}><header><h2>{title}</h2><button aria-label={copy.close} onClick={onClose}>×</button></header><input autoFocus aria-label={copy.search} placeholder={copy.placeholder} value={query} onChange={e=>{setQuery(e.target.value);setLimit(60);}}/><p>{formatUiCount(locale,results.length,copy,"language")} · ISO 639-3</p><div className={s.pickerResults}>{results.slice(0,limit).map(item=><button key={item.code} onClick={()=>{onChoose(item.name);onClose();}}><span>{previewLanguageName(locale,item.name)}{item.native!==item.name&&item.native!==item.code&&<small lang={item.code} className={s.nativeName}>{item.native}</small>}</span><small>{item.code}</small></button>)}{results.length===0&&<p>{copy.empty}</p>}{results.length>limit&&<button onClick={()=>setLimit(v=>v+100)}>{copy.more}</button>}</div><footer>{copy.footer}</footer></DialogSurface>;
}
