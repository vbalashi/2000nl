"use client";
import {ChoiceSelect} from "./ChoiceSelect";
import React,{useEffect,useState} from "react";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import {IconAction} from "@/components/practice/ui/IconAction";
import overlays from "@/components/practice/library/libraryOverlays.module.css";
import {localizedSection} from "@/lib/i18n/catalog";
import {X,Share2,LockKeyhole,Tags,List,Pencil} from "lucide-react";
import type {CollectionDetails,CollectionDetailsPatch,CollectionSourceDetails} from "@/lib/collections/details/model";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {formatUiCount} from "@/lib/uiMessages";
import {organizationCopy} from "./copy";
import s from "./organization.module.css";

const emptySource:CollectionSourceDetails={materialKind:null,originKind:null,materialTitle:null,creatorName:null,url:null,fileName:null,publishedOn:null};
type Draft={name:string;description:string;source:CollectionSourceDetails;revision:string;original:{name:string;description:string;source:CollectionSourceDetails}};
function safeLink(value:string|null){if(!value)return null;try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}}
export function CollectionDetailsPanel({details,labelNames,locale,isShared,onClose,onLabels,onOpen,onSave,saving=false,error,onRetry}:{details:CollectionDetails;labelNames:string[];locale:OnboardingLanguage;isShared:boolean;onClose:()=>void;onLabels:()=>void;onOpen:()=>void;onSave?:(patch:CollectionDetailsPatch,revision:string)=>Promise<boolean>;saving?:boolean;error?:string|null;onRetry?:()=>Promise<string|null>}){
 const t=organizationCopy(locale),copy=localizedSection("collectionDetails")[locale];
 const [draft,setDraft]=useState<Draft|null>(null);
 const source=details.source;
 const values=source?[[copy.materialKind,source.materialKind?copy[source.materialKind]:null],[copy.originKind,source.originKind?source.originKind==='local_file'?copy.localFile:copy[source.originKind]:null],[copy.materialTitle,source.materialTitle],[copy.creatorName,source.creatorName],[copy.url,source.url],[copy.fileName,source.fileName],[copy.publishedOn,source.publishedOn]]:[];
 const start=()=>{if(details.revision!==null)setDraft({name:details.name,description:details.description??'',source:{...emptySource,...details.source},revision:details.revision,original:{name:details.name,description:details.description??'',source:{...emptySource,...details.source}}});};
 const field=(key:keyof CollectionSourceDetails,value:string)=>setDraft(d=>d?{...d,source:{...d.source,[key]:value||null}}:d);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!draft||!onSave)return;const patch:CollectionDetailsPatch={};if(draft.name!==draft.original.name)patch.name=draft.name;if(draft.description!==draft.original.description)patch.description=draft.description||null;const changed:Partial<CollectionSourceDetails>={};for(const key of Object.keys(emptySource) as (keyof CollectionSourceDetails)[]){if(draft.source[key]!==draft.original.source[key])Object.assign(changed,{[key]:draft.source[key]});}if(Object.keys(changed).length)patch.source=changed;if(await onSave(patch,draft.revision))setDraft(null);};
 return <section className={s.editor}>
  <header><h2>{details.name}</h2><IconAction label={t.close} onClick={onClose}><X size={20}/></IconAction></header>
  {draft?<form className={s.detailsForm} onSubmit={submit}>
   <label>{t.name}<input required maxLength={100} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <label>{copy.description}<textarea maxLength={4000} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
   <ChoiceSelect label={copy.materialKind} value={draft.source.materialKind??""} onChange={value=>field("materialKind",value)} locale={locale} options={[{id:"",label:"—"},...(["video","article","text","book","other"] as const).map(k=>({id:k,label:copy[k]}))]}/>
   <ChoiceSelect label={copy.originKind} value={draft.source.originKind??""} onChange={value=>field("originKind",value)} locale={locale} options={[{id:"",label:"—"},...(["youtube","web","local_file","manual","other"] as const).map(k=>({id:k,label:k==="local_file"?copy.localFile:copy[k]}))]}/>
   {(['materialTitle','creatorName','url','fileName','publishedOn'] as const).map(k=><label key={k}>{copy[k]}<input type={k==='publishedOn'?'date':k==='url'?'url':'text'} maxLength={k==='publishedOn'?undefined:2048} value={draft.source[k]??''} onChange={e=>field(k,e.target.value)}/></label>)}
   {error&&<p role="alert">{error} {onRetry&&<button type="button" onClick={()=>void onRetry().then(revision=>{if(revision!==null)setDraft(current=>current?{...current,revision}:current);})}>{t.retry}</button>}</p>}
   <footer><button type="button" disabled={saving} onClick={()=>setDraft(null)}>{t.cancel}</button><button type="submit" disabled={saving}>{saving?t.saving:t.save}</button></footer>
  </form>:<>
   {details.description&&<p>{details.description}</p>}
   {details.itemCount!==null&&<p className={s.detailMetadata}>{formatUiCount(locale,details.itemCount,t,"meaning")}</p>}
   {source&&values.some(([,value])=>value)&&<><h2>{copy.source}</h2><dl className={s.detailFields}>{values.filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{label===copy.url&&value&&safeLink(value)?<a href={safeLink(value)!} target="_blank" rel="noreferrer">{value}</a>:label===copy.publishedOn&&value?new Intl.DateTimeFormat(locale,{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`)):value}</dd></div>)}</dl></>}
   {!details.capabilities.canEditDetails&&<p className={s.detailMetadata}>{copy.readOnly}</p>}
   {details.capabilities.canEditDetails&&onSave&&<button type="button" onClick={start}><Pencil size={16}/>{t.editCollection}</button>}
  </>}
  <h2>{t.labels}</h2><div className={s.detailLabels}>{labelNames.length?labelNames.map(name=><span key={name}>{name}</span>):<p>{t.addLabels}</p>}</div>
  <p className={s.detailMetadata}>{isShared?<Share2 size={16}/>:<LockKeyhole size={16}/>} {isShared?t.shared:t.private}</p>
  <footer className={s.detailActions}>{details.capabilities.canEditLabels&&<button type="button" onClick={onLabels}><Tags size={16} aria-hidden="true"/>{t.assign}</button>}<button type="button" onClick={onOpen}><List size={16} aria-hidden="true"/>{t.open}</button></footer>
 </section>;
}
export function CollectionDetailsSurface({name,onClose,children}:{name:string;onClose:()=>void;children:React.ReactNode}){
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{const media=window.matchMedia('(max-width:700px)');const update=()=>setMobile(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 return mobile?<DialogSurface className={`${overlays.dialog} ${s.detailsPane} ${s.mobileDetailsDialog}`} aria-label={name} onDismiss={onClose}>{children}</DialogSurface>:<aside className={s.detailsPane} aria-label={name}>{children}</aside>;
}
