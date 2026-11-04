"use client";
import React, { useCallback, useState } from "react";
import { ArrowDownAZ, MessageCircle, FileText, Check } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { ActionMenu } from "../ui/ActionMenu";
import { IconAction } from "../ui/IconAction";
import workspace from "./libraryWorkspace.module.css";
export type LibrarySort = "alphabetical" | "spoken" | "written";
const copy={
 ru:{title:"Сортировка",alphabetical:"По алфавиту",spoken:"По частоте в разговоре",written:"По частоте на письме",spokenHelp:"Сначала слова, которые чаще встречаются в разговорах (CGN). Без рейтинга — в конце, по алфавиту.",writtenHelp:"Сначала слова, которые чаще встречаются в текстах (SoNaR500). Без рейтинга — в конце, по алфавиту."},
 en:{title:"Sort",alphabetical:"Alphabetical",spoken:"Spoken frequency",written:"Written frequency",spokenHelp:"Common words in conversations first (CGN). Words without a rank follow alphabetically.",writtenHelp:"Common words in texts first (SoNaR500). Words without a rank follow alphabetically."},
 nl:{title:"Sorteren",alphabetical:"Alfabetisch",spoken:"Frequentie in gesprekken",written:"Frequentie in teksten",spokenHelp:"Veelgebruikte woorden in gesprekken eerst (CGN). Woorden zonder rang komen daarna, op alfabet.",writtenHelp:"Veelgebruikte woorden in teksten eerst (SoNaR500). Woorden zonder rang komen daarna, op alfabet."},
};
export function LibrarySortControl({value,onChange,language}:{value:LibrarySort;onChange:(value:LibrarySort)=>void;language:OnboardingLanguage}){
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null),t=copy[language];
 const close=useCallback(()=>{anchor?.focus({preventScroll:true});setAnchor(null);},[anchor]);
 const Icon=value==="alphabetical"?ArrowDownAZ:value==="spoken"?MessageCircle:FileText;
 const options:LibrarySort[]=["alphabetical","spoken","written"];
 return <><IconAction label={`${t.title}: ${t[value]}`} title={`${t.title}: ${t[value]}`} className={workspace.filterButton} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={event=>setAnchor(event.currentTarget)}><Icon size={18} aria-hidden="true"/></IconAction>
 {anchor&&<ActionMenu anchor={anchor} title={t.title} language={language} onClose={close} items={options.map(id=>({id,label:t[id],description:id==="spoken"?t.spokenHelp:id==="written"?t.writtenHelp:undefined,icon:id===value?<Check size={14} aria-hidden="true"/>:undefined,onSelect:()=>{onChange(id);close();}}))}/>}</>;
}
