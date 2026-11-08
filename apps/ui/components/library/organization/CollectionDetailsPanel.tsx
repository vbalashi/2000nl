"use client";
import {DateField} from "@/components/practice/ui/DateField";
import {ChoiceSelect} from "./ChoiceSelect";
import React,{useEffect,useId,useState} from "react";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import {SettingsHelp} from "@/components/practice/settings/SettingsHelp";
import {IconAction} from "@/components/practice/ui/IconAction";
import overlays from "@/components/practice/library/libraryOverlays.module.css";
import {localizedSection} from "@/lib/i18n/catalog";
import {X,Share2,LockKeyhole,Tags,List,ChevronDown,Folder,UserRound} from "lucide-react";
import type {CollectionDetails,CollectionDetailsPatch,CollectionSourceDetails} from "@/lib/collections/details/model";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {formatUiCount} from "@/lib/uiMessages";
import {organizationCopy} from "./copy";
import s from "./organization.module.css";

const emptySource:CollectionSourceDetails={materialKind:null,originKind:null,materialTitle:null,creatorName:null,url:null,fileName:null,publishedOn:null};
type Draft={name:string;description:string;source:CollectionSourceDetails;revision:string;original:{name:string;description:string;source:CollectionSourceDetails}};
function safeLink(value:string|null){if(!value)return null;try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}}
export function CollectionDetailsPanel({details,labelNames,locale,isShared,isReceived=false,onClose,onLabels,onOpen,onSave,saving=false,error,onRetry}:{details:CollectionDetails;labelNames:string[];locale:OnboardingLanguage;isShared:boolean;isReceived?:boolean;onClose:()=>void;onLabels:()=>void;onOpen:()=>void;onSave?:(patch:CollectionDetailsPatch,revision:string)=>Promise<boolean>;saving?:boolean;error?:string|null;onRetry?:()=>Promise<string|null>}){
 const t=organizationCopy(locale),copy=localizedSection("collectionDetails")[locale];
 const [draft,setDraft]=useState<Draft|null>(null),[editorOpen,setEditorOpen]=useState(false),editorId=useId();
 const source=details.source;
 const values=source?[[copy.materialKind,source.materialKind?copy[source.materialKind]:null],[copy.originKind,source.originKind?source.originKind==='local_file'?copy.localFile:copy[source.originKind]:null],[copy.materialTitle,source.materialTitle],[copy.creatorName,source.creatorName],[copy.url,source.url],[copy.fileName,source.fileName],[copy.publishedOn,source.publishedOn]]:[];
 const start=()=>{setEditorOpen(true);if(draft)return;if(details.revision!==null)setDraft({name:details.name,description:details.description??'',source:{...emptySource,...details.source},revision:details.revision,original:{name:details.name,description:details.description??'',source:{...emptySource,...details.source}}});};
 const field=(key:keyof CollectionSourceDetails,value:string)=>setDraft(d=>d?{...d,source:{...d.source,[key]:value||null}}:d);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!draft||!onSave)return;const patch:CollectionDetailsPatch={};if(draft.name!==draft.original.name)patch.name=draft.name;if(draft.description!==draft.original.description)patch.description=draft.description||null;const changed:Partial<CollectionSourceDetails>={};for(const key of Object.keys(emptySource) as (keyof CollectionSourceDetails)[]){if(draft.source[key]!==draft.original.source[key])Object.assign(changed,{[key]:draft.source[key]});}if(Object.keys(changed).length)patch.source=changed;if(await onSave(patch,draft.revision)){setDraft(null);setEditorOpen(false);}};
 const received=isReceived;
 const access=received?t.received:isShared?t.sharedByYou:t.private;
 return <section className={`${s.editor} ${s.collectionDetails}`}>
  <div className={s.detailHeading}><header><div className={s.detailTitle}><span role="img" className={s.detailAccess} aria-label={access} title={access}>{received?<UserRound size={18} aria-hidden="true"/>:isShared?<Share2 size={18} aria-hidden="true"/>:<LockKeyhole size={18} aria-hidden="true"/>}</span><h2>{details.name}</h2></div><IconAction label={t.close} onClick={onClose}><X size={20}/></IconAction></header>
   <div className={s.detailSummary}>{details.itemCount!==null&&<span>{formatUiCount(locale,details.itemCount,t,"meaning")}</span>}{!details.capabilities.canEditDetails&&<>{details.itemCount!==null&&<span aria-hidden="true">·</span>}<span className={s.readOnlyBadge}><LockKeyhole size={13} aria-hidden="true"/>{copy.readOnlyLabel}<SettingsHelp label={copy.readOnlyLabel} text={copy.readOnly}/></span></>}</div>
  </div>
  {details.description&&<p className={s.detailDescription}>{details.description}</p>}
  {details.capabilities.canEditDetails&&onSave&&<button className={s.editDisclosure} type="button" aria-expanded={editorOpen} aria-controls={editorId} disabled={saving} onClick={()=>editorOpen?setEditorOpen(false):start()}>{editorOpen?copy.hideEditor:source?copy.editDetails:copy.addDetails}<ChevronDown size={16} aria-hidden="true"/></button>}
  {draft&&editorOpen?<form id={editorId} className={s.detailsForm} onSubmit={submit}>
   <label>{t.name}<input required maxLength={100} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <label>{copy.description}<textarea maxLength={4000} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
   <ChoiceSelect label={copy.materialKind} value={draft.source.materialKind??""} onChange={value=>field("materialKind",value)} locale={locale} options={[{id:"",label:"—"},...(["video","article","text","book","other"] as const).map(k=>({id:k,label:copy[k]}))]}/>
   <ChoiceSelect label={copy.originKind} value={draft.source.originKind??""} onChange={value=>field("originKind",value)} locale={locale} options={[{id:"",label:"—"},...(["youtube","web","local_file","manual","other"] as const).map(k=>({id:k,label:k==="local_file"?copy.localFile:copy[k]}))]}/>
   {(['materialTitle','creatorName','url','fileName'] as const).map(k=><label key={k}>{copy[k]}<input type={k==='url'?'url':'text'} maxLength={2048} value={draft.source[k]??''} onChange={e=>field(k,e.target.value)}/></label>)}
   <DateField label={copy.publishedOn} value={draft.source.publishedOn??''} onChange={value=>field('publishedOn',value)} locale={locale} disabled={saving} labels={{previousMonth:copy.previousMonth,nextMonth:copy.nextMonth,year:copy.year,clear:copy.clearDate,cancel:t.cancel}}/>
   {error&&<p role="alert">{error} {onRetry&&<button type="button" onClick={()=>void onRetry().then(revision=>{if(revision!==null)setDraft(current=>current?{...current,revision}:current);})}>{t.retry}</button>}</p>}
   <footer><button type="button" disabled={saving} onClick={()=>{setDraft(null);setEditorOpen(false);}}>{t.cancel}</button><button type="submit" disabled={saving}>{saving?t.saving:t.save}</button></footer>
  </form>:<>
   {source&&values.some(([,value])=>value)&&<section className={s.detailSection}><h3>{copy.source}</h3><dl className={s.detailFields}>{values.filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{label===copy.url&&value&&safeLink(value)?<a href={safeLink(value)!} target="_blank" rel="noreferrer">{value}</a>:label===copy.publishedOn&&value?new Intl.DateTimeFormat(locale,{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`)):value}</dd></div>)}</dl></section>}
  </>}
  <section className={s.detailSection}><h3>{t.labels}</h3><div className={s.detailLabels}>{labelNames.length?labelNames.map(name=><span key={name}><Folder size={13} aria-hidden="true"/>{name}</span>):<p>{t.noLabels}</p>}</div></section>
  <footer className={s.detailActions}>{details.capabilities.canEditLabels&&<button type="button" onClick={onLabels}><Tags size={16} aria-hidden="true"/>{t.assign}</button>}<button type="button" onClick={onOpen}><List size={16} aria-hidden="true"/>{t.open}</button></footer>
 </section>;
}
export function CollectionDetailsSurface({name,onClose,children}:{name:string;onClose:()=>void;children:React.ReactNode}){
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{const media=window.matchMedia('(max-width:700px)');const update=()=>setMobile(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 return mobile?<DialogSurface className={`${overlays.dialog} ${s.detailsPane} ${s.mobileDetailsDialog}`} aria-label={name} onDismiss={onClose}>{children}</DialogSurface>:<aside className={s.detailsPane} aria-label={name}>{children}</aside>;
}
