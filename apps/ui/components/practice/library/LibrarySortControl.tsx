"use client";
import React, { useCallback, useState } from "react";
import { ArrowDownAZ, MessageCircle, FileText, Check } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { ActionMenu } from "../ui/ActionMenu";
import { IconAction } from "../ui/IconAction";
import workspace from "./libraryWorkspace.module.css";
export type LibrarySort = "alphabetical" | "spoken" | "written";
const copy={
 ru:{title:"Сортировка",alphabetical:"По алфавиту",spoken:"По частоте в разговоре",written:"По частоте на письме",help:"Не у всех слов известна частота употребления. При сортировке по частотности такие слова идут в конце списка, по алфавиту.",spokenHelp:"Сначала слова, которые чаще встречаются в разговорах.",writtenHelp:"Сначала слова, которые чаще встречаются в текстах."},
 en:{title:"Sort",alphabetical:"Alphabetical",spoken:"Spoken frequency",written:"Written frequency",help:"We do not know how often every word is used. When sorting by frequency, words without this information come last, in alphabetical order.",spokenHelp:"Words used more often in conversations come first.",writtenHelp:"Words used more often in texts come first."},
 nl:{title:"Sorteren",alphabetical:"Alfabetisch",spoken:"Frequentie in gesprekken",written:"Frequentie in teksten",help:"Niet van elk woord weten we hoe vaak het voorkomt. Bij sorteren op frequentie komen woorden zonder deze gegevens onderaan, op alfabet.",spokenHelp:"Woorden die vaker voorkomen in gesprekken staan bovenaan.",writtenHelp:"Woorden die vaker voorkomen in teksten staan bovenaan."},
};
export function LibrarySortControl({value,onChange,language}:{value:LibrarySort;onChange:(value:LibrarySort)=>void;language:OnboardingLanguage}){
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null),t=copy[language];
 const close=useCallback(()=>{anchor?.focus({preventScroll:true});setAnchor(null);},[anchor]);
 const Icon=value==="alphabetical"?ArrowDownAZ:value==="spoken"?MessageCircle:FileText;
 const options:LibrarySort[]=["alphabetical","spoken","written"];
 return <><IconAction label={`${t.title}: ${t[value]}`} title={`${t.title}: ${t[value]}`} className={workspace.filterButton} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={event=>setAnchor(event.currentTarget)}><Icon size={18} aria-hidden="true"/></IconAction>
 {anchor&&<ActionMenu anchor={anchor} title={t.title} language={language} onClose={close} notice={t.help} items={options.map(id=>({id,label:t[id],description:id==="spoken"?t.spokenHelp:id==="written"?t.writtenHelp:undefined,icon:id===value?<Check size={14} aria-hidden="true"/>:undefined,onSelect:()=>{onChange(id);close();}}))}/>}</>;
}
