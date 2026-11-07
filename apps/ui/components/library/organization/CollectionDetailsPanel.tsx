"use client";
import React,{useEffect,useState} from "react";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import overlays from "@/components/practice/library/libraryOverlays.module.css";
import {localizedSection} from "@/lib/i18n/catalog";
import {X,Share2,LockKeyhole,Tags,List} from "lucide-react";
import type {CollectionDetails} from "@/lib/collections/details/model";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {formatUiCount} from "@/lib/uiMessages";
import {organizationCopy} from "./copy";
import s from "./organization.module.css";

/** Read-only summary presentation until an authoritative details adapter is available. */
export function CollectionDetailsPanel({details,labelNames,locale,isShared,onClose,onLabels,onOpen}:{details:CollectionDetails;labelNames:string[];locale:OnboardingLanguage;isShared:boolean;onClose:()=>void;onLabels:()=>void;onOpen:()=>void}){
 const t=organizationCopy(locale);
 const copy=localizedSection("collectionDetails")[locale];
 const source=details.source;
 const values=source?[[copy.materialKind,source.materialKind?copy[source.materialKind]:null],[copy.originKind,source.originKind?source.originKind==='local_file'?copy.localFile:copy[source.originKind]:null],[copy.materialTitle,source.materialTitle],[copy.creatorName,source.creatorName],[copy.url,source.url],[copy.fileName,source.fileName],[copy.publishedOn,source.publishedOn]]:[];
 return <section className={s.editor}>
  <header><h2>{details.name}</h2><button type="button" aria-label={t.close} onClick={onClose}><X size={20}/></button></header>
  {details.description&&<p>{details.description}</p>}
  {details.itemCount!==null&&<p className={s.detailMetadata}>{formatUiCount(locale,details.itemCount,t,"meaning")}</p>}
  {details.persistence==='preview'&&<p role="status" className={`${s.muted} ${s.detailMetadata}`}>{copy.preview}</p>}
  {source&&<><h2>{copy.source}</h2><dl className={s.detailFields}>{values.filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{label===copy.url&&value&&/^https?:\/\//i.test(value)?<a href={value} target="_blank" rel="noreferrer">{value}</a>:label===copy.publishedOn&&value?new Intl.DateTimeFormat(locale,{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`)):value}</dd></div>)}</dl></>}
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
