"use client";
import {DateField} from "@/components/practice/ui/DateField";
import {ChoiceSelect} from "./ChoiceSelect";
import React,{useEffect,useState} from "react";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import {SettingsHelp} from "@/components/practice/settings/SettingsHelp";
import {IconAction} from "@/components/practice/ui/IconAction";
import overlays from "@/components/practice/library/libraryOverlays.module.css";
import {formatMessage,localizedSection} from "@/lib/i18n/catalog";
import {X,Share2,LockKeyhole,Tags,List,Pencil,Folder,UserRound} from "lucide-react";
import type {CollectionDetails,CollectionDetailsPatch,CollectionSourceDetails} from "@/lib/collections/details/model";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {formatUiCount} from "@/lib/uiMessages";
import {organizationCopy} from "./copy";
import s from "./organization.module.css";

type Field="name"|"description"|keyof CollectionSourceDetails;
type Draft={key:Field;value:string;original:string;revision:string};
const sourceFields=["materialKind","originKind","materialTitle","creatorName","url","fileName","publishedOn"] as const;
function safeLink(value:string|null){if(!value)return null;try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}}
export function CollectionDetailsPanel({details,labelNames,locale,isShared,isReceived=false,onClose,onLabels,onOpen,onSave,saving=false,error,onRetry}:{details:CollectionDetails;labelNames:string[];locale:OnboardingLanguage;isShared:boolean;isReceived?:boolean;onClose:()=>void;onLabels:()=>void;onOpen:()=>void;onSave?:(patch:CollectionDetailsPatch,revision:string)=>Promise<boolean>;saving?:boolean;error?:string|null;onRetry?:()=>Promise<string|null>}){
 const t=organizationCopy(locale),copy=localizedSection("collectionDetails")[locale];
 const [draft,setDraft]=useState<Draft|null>(null);
 const label=(key:Field)=>key==='name'?copy.collectionName:copy[key];
 const raw=(key:Field)=>key==='name'?details.name:key==='description'?details.description:details.source?.[key];
 const canEdit=(key:Field)=>Boolean(onSave&&details.revision!==null&&(key==='name'||key==='description'?details.capabilities.canEditDetails:details.capabilities.canEditSource));
 const start=(key:Field)=>{if(!canEdit(key)||draft)return;const value=raw(key)??'';setDraft({key,value,original:value,revision:details.revision!});};
 const cancel=()=>setDraft(null);
 const submit=async(event:React.FormEvent)=>{event.preventDefault();if(!draft||!onSave||saving)return;if(draft.value===draft.original){cancel();return;}
  const patch:CollectionDetailsPatch=draft.key==='name'?{name:draft.value}:draft.key==='description'?{description:draft.value||null}:{source:{[draft.key]:draft.value||null}};
  if(await onSave(patch,draft.revision))cancel();
 };
 const edit=(key:Field)=>canEdit(key)?<button className={s.fieldPencil} type="button" aria-label={formatMessage(copy.editField,{field:label(key)})} title={formatMessage(copy.editField,{field:label(key)})} disabled={saving||Boolean(draft)} onClick={()=>start(key)}><Pencil size={13} aria-hidden="true"/></button>:null;
 const editor=(key:Field)=>{
  if(draft?.key!==key)return null;
  const change=(value:string)=>setDraft(current=>current?{...current,value}:current);
  const choices=key==='materialKind'?(["video","article","text","book","other"] as const).map(id=>({id,label:copy[id]})):key==='originKind'?(["youtube","web","local_file","manual","other"] as const).map(id=>({id,label:id==='local_file'?copy.localFile:copy[id]})):null;
  return <form className={`${s.detailsForm} ${s.inlineFieldForm}`} aria-label={label(key)} onSubmit={submit} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented&&(!(event.target instanceof Element)||event.target.closest('dialog')===event.currentTarget.closest('dialog'))){event.preventDefault();event.stopPropagation();if(!saving)cancel();}}}>
   {choices?<ChoiceSelect label={label(key)} value={draft.value} options={[{id:'',label:copy.notSpecified},...choices]} onChange={change} disabled={saving} locale={locale}/>:key==='publishedOn'?<DateField label={label(key)} value={draft.value} onChange={change} locale={locale} disabled={saving} labels={{previousMonth:copy.previousMonth,nextMonth:copy.nextMonth,year:copy.year,clear:copy.clearDate,cancel:t.cancel}}/>:key==='description'?<textarea placeholder={copy.notSpecified} rows={1} aria-label={label(key)} autoFocus onFocus={event=>event.currentTarget.select()} maxLength={4000} disabled={saving} value={draft.value} onChange={event=>change(event.target.value)}/>:<input placeholder={key==='name'?copy.collectionName:copy.notSpecified} aria-label={label(key)} autoFocus onFocus={event=>event.currentTarget.select()} required={key==='name'} type={key==='url'?'url':'text'} maxLength={key==='name'?100:2048} disabled={saving} value={draft.value} onChange={event=>change(event.target.value)}/>}
   {error&&<p role="alert">{error} {onRetry&&<button type="button" onClick={()=>void onRetry().then(revision=>{if(revision!==null)setDraft(current=>current?{...current,revision}:current);})}>{t.retry}</button>}</p>}
   <footer><button type="button" disabled={saving} onClick={cancel}>{t.cancel}</button><button type="submit" disabled={saving}>{saving?t.saving:t.save}</button></footer>
  </form>;
 };
 const value=(key:Field)=>{
  const text=raw(key);if(!text)return <span className={s.emptyDetail}>{copy.notSpecified}</span>;
  if(key==='materialKind')return copy[text as NonNullable<CollectionSourceDetails['materialKind']>];
  if(key==='originKind')return text==='local_file'?copy.localFile:copy[text as Exclude<NonNullable<CollectionSourceDetails['originKind']>,'local_file'>];
  if(key==='publishedOn')return new Intl.DateTimeFormat(locale,{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(`${text}T12:00:00Z`));
  if(key==='url'&&safeLink(text))return <a href={safeLink(text)!} target="_blank" rel="noreferrer">{text}</a>;
  return text;
 };
 const access=isReceived?t.received:isShared?t.sharedByYou:t.private;
 return <section className={`${s.editor} ${s.collectionDetails}`}>
  <div className={s.detailHeading}><header><div className={s.detailTitle}><span role="img" className={s.detailAccess} aria-label={access} title={access}>{isReceived?<UserRound size={18} aria-hidden="true"/>:isShared?<Share2 size={18} aria-hidden="true"/>:<LockKeyhole size={18} aria-hidden="true"/>}</span>{draft?.key==='name'?editor('name'):<><h2>{details.name}</h2>{edit('name')}</>}</div><IconAction label={t.close} onClick={onClose}><X size={20}/></IconAction></header>
   <div className={s.detailSummary}>{details.itemCount!==null&&<span>{formatUiCount(locale,details.itemCount,t,"meaning")}</span>}{!details.capabilities.canEditDetails&&<>{details.itemCount!==null&&<span aria-hidden="true">·</span>}<span className={s.readOnlyBadge}><LockKeyhole size={13} aria-hidden="true"/>{copy.readOnlyLabel}<SettingsHelp label={copy.readOnlyLabel} text={copy.readOnly}/></span></>}</div>
  </div>
  <dl className={s.detailFields}><div><dt>{copy.description}</dt><dd>{draft?.key==='description'?editor('description'):<div className={s.fieldValue}><span>{value('description')}</span>{edit('description')}</div>}</dd></div></dl>
  <section className={s.detailSection}><h3>{copy.source}</h3><dl className={s.detailFields}>{sourceFields.map(key=><div key={key}><dt>{label(key)}{key==='materialTitle'&&<SettingsHelp label={copy.materialTitle} text={copy.materialTitleHelp}/>}</dt><dd>{draft?.key===key?editor(key):<div className={s.fieldValue}><span>{value(key)}</span>{edit(key)}</div>}</dd></div>)}</dl></section>
  <section className={s.detailSection}><h3>{t.labels}</h3><div className={s.detailLabels}>{labelNames.length?labelNames.map(name=><span key={name}><Folder size={13} aria-hidden="true"/>{name}</span>):<p>{t.noLabels}</p>}</div></section>
  <footer className={s.detailActions}>{details.capabilities.canEditLabels&&<button type="button" onClick={onLabels} disabled={Boolean(draft)}><Tags size={16} aria-hidden="true"/>{t.assign}</button>}<button type="button" onClick={onOpen} disabled={Boolean(draft)}><List size={16} aria-hidden="true"/>{t.open}</button></footer>
 </section>;
}
export function CollectionDetailsSurface({name,onClose,children}:{name:string;onClose:()=>void;children:React.ReactNode}){
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{const media=window.matchMedia('(max-width:700px)');const update=()=>setMobile(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 return mobile?<DialogSurface className={`${overlays.dialog} ${s.detailsPane} ${s.mobileDetailsDialog}`} aria-label={name} onDismiss={onClose}>{children}</DialogSurface>:<aside className={s.detailsPane} aria-label={name}>{children}</aside>;
}
