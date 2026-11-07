'use client';
import { localizedField } from "@/lib/i18n/catalog";

import React,{useCallback,useState} from 'react';
import {ArrowDownAZ,Check,History,ListOrdered} from 'lucide-react';
import {IconAction} from '@/components/practice/ui/IconAction';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {ActionMenu} from '@/components/practice/ui/ActionMenu';
import {organizationCopy} from './copy';
import s from './organization.module.css';
type Sort='recent'|'name'|'count';
/** The same themed menu and keyboard behavior as Settings language choices. */
export function CollectionSortControl({value,onChange,locale}:{value:Sort;onChange:(value:Sort)=>void;locale:OnboardingLanguage}){
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null);
 const close=useCallback(()=>{if(anchor?.isConnected)anchor.focus({preventScroll:true});setAnchor(null);},[anchor]);
 const t=organizationCopy(locale),title=localizedField("libraryOrganization", "sort")[locale];
 const options=[{id:'recent' as const,label:t.recent},{id:'name' as const,label:t.alphabetic},{id:'count' as const,label:t.count}];
 const label=`${title}: ${options.find(item=>item.id===value)?.label}`;
 const Icon=value==='name'?ArrowDownAZ:value==='count'?ListOrdered:History;
 return <><IconAction className={s.sortControl} label={label} title={label} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={event=>setAnchor(event.currentTarget)}>
  <Icon size={18} aria-hidden="true"/>
 </IconAction>{anchor&&<ActionMenu anchor={anchor} title={title} language={locale} onClose={close} items={options.map(item=>({...item,icon:item.id===value?<Check size={14} aria-hidden="true"/>:<span className={s.sortCheckSpace} aria-hidden="true"/>,onSelect:()=>{onChange(item.id);close();}}))}/>}</>;
}
