import React from 'react';
import {FileText,Folder,Share2,UserRound} from 'lucide-react';
import s from './organization.module.css';
/** Keep the object type visible; the small badge communicates its access. */
export function CollectionAccessIcon({kind='collection',shared=false,received=false,label}:{kind?:'collection'|'label';shared?:boolean;received?:boolean;label:string}){
 const Base=kind==='label'?Folder:FileText;
 return <span role="img" aria-label={label} title={label} className={s.objectAccessIcon}><Base size={18} aria-hidden="true"/>{(shared||received)&&<span className={s.objectAccessBadge}>{received?<UserRound size={10} aria-hidden="true"/>:<Share2 size={10} aria-hidden="true"/>}</span>}</span>;
}
