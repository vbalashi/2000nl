"use client";
import React, {useState} from "react";
import {Check, ChevronDown} from "lucide-react";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {getUiMessages} from "@/lib/uiMessages";
import {VOCABULARY_PARTS,type VocabularyPart} from "@/lib/vocabulary/partsOfSpeech";
import {SegmentedControl} from "../ui/SegmentedControl";
import {BuilderChoice} from "../builder/BuilderChoice";
import {IconAction} from "../ui/IconAction";
import {localizedSection} from "@/lib/i18n/catalog";
import {ActionMenu} from "../ui/ActionMenu";
import {NounFilterPopover} from "../library/NounFilterPopover";
import s from "./partOfSpeechSelection.module.css";
const nounArticles=[null,"de","het"] as const;
export type PartSelection={parts:VocabularyPart[];article:"de"|"het"|null};
export function PartOfSpeechSelection({value,onChange,language,languageCode, compact=false}:{value:PartSelection;onChange:(value:PartSelection)=>void;language:OnboardingLanguage;languageCode:string;compact?:boolean}){
 const b=getUiMessages(language).builder;
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null);
 const toggle=(part:VocabularyPart)=>{const next=value.parts.includes(part)?value.parts.filter(item=>item!==part):[...value.parts,part];onChange({parts:next,article:next.includes("noun")?value.article:null});};
 return <><SegmentedControl standard label={b.partOfSpeech}>
  {VOCABULARY_PARTS.map(part=><div className={s.choice} key={part.id}>
   <BuilderChoice active={value.parts.includes(part.id)} onClick={()=>toggle(part.id)}>{b.parts[part.labelKey]}{part.id==="noun"&&value.article&&<span className={s.dot} role="img" aria-label={b.subfiltersActive}/>}</BuilderChoice>
   {part.id==="noun"&&languageCode==="nl"&&<IconAction label={b.nounSubfilters} aria-haspopup={compact?"menu":"dialog"} aria-expanded={Boolean(anchor)} className={s.disclosure} onClick={event=>{if(!value.parts.includes("noun"))onChange({...value,parts:[...value.parts,"noun"]});setAnchor(event.currentTarget);}}><ChevronDown size={15}/></IconAction>}
  </div>)}
 </SegmentedControl>
 {anchor&&compact&&<ActionMenu anchor={anchor} title={b.nounArticle} language={language} onClose={()=>{anchor.focus();setAnchor(null);}} items={nounArticles.map(article=>({id:article??"all",label:article??localizedSection("vocabularySelection")[language].all,trailingIcon:article===value.article?<Check size={14}/>:undefined,onSelect:()=>{onChange({...value,article});anchor.focus();setAnchor(null);}}))}/>}
 {anchor&&!compact&&<NounFilterPopover locale={language} anchor={anchor} article={value.article} onChange={article=>onChange({...value,article})} onClose={()=>setAnchor(null)}/>}
 </>;
}
