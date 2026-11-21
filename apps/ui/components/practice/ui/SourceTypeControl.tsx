'use client';
import React from 'react';
import {BookOpen,Folder,Layers,Share2} from 'lucide-react';
import {localizedField} from '@/lib/i18n/catalog';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {SegmentedControl} from './SegmentedControl';
import {BuilderChoice} from '../builder/BuilderChoice';
import {organizationCopy} from '@/components/library/organization/copy';
import s from './sourceTypeControl.module.css';
export type SourceKind='all'|'dictionary'|'collection'|'label'|'shared';
export function sourceTypeMatches(filter:SourceKind,kind:Exclude<SourceKind,'all'|'shared'>,received=false){
 return filter==='all'||(filter==='shared'?received:filter==='collection'?kind!=='dictionary'&&!received:kind===filter);
}
export function SourceTypeControl({locale,value,onChange,disabled=false,showLabels=false}:{locale:OnboardingLanguage;value:SourceKind;onChange:(value:SourceKind)=>void;disabled?:boolean;showLabels?:boolean}){
 const labels=localizedField('sourcePicker','labels')[locale];
 return <SegmentedControl standard label={localizedField('sourcePicker','type')[locale]}>
  {(['all','dictionary','collection','shared','label'] as const).filter(kind=>kind!=='label'||showLabels).map((kind,index)=>{
   const label=kind==='label'?organizationCopy(locale).labels:kind==='shared'?localizedField('sourcePicker','shared')[locale]:labels[index];
   const Icon=kind==='dictionary'?BookOpen:kind==='collection'?Layers:kind==='shared'?Share2:kind==='label'?Folder:null;
   return <BuilderChoice key={kind} active={value===kind} disabled={disabled} aria-label={label} title={label} onClick={()=>onChange(kind)} className={s.choice}>{Icon&&<Icon size={15} aria-hidden="true"/>}<span className={kind==='shared'?s.shared:kind==='all'?undefined:s.label}>{label}</span></BuilderChoice>;
  })}
 </SegmentedControl>;
}
