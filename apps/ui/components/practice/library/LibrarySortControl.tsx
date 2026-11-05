"use client";
import { localizedField, localizedSection } from "@/lib/i18n/catalog";

import React, { useCallback, useState } from "react";
import { ArrowDownAZ, MessageCircle, FileText, Check } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { ActionMenu } from "../ui/ActionMenu";
import { IconAction } from "../ui/IconAction";
import workspace from "./libraryWorkspace.module.css";
export type LibrarySort = "alphabetical" | "spoken" | "written";
const copy=localizedSection("librarySorting");
export function LibrarySortControl({value,onChange,language}:{value:LibrarySort;onChange:(value:LibrarySort)=>void;language:OnboardingLanguage}){
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null),t=copy[language];
 const close=useCallback(()=>{anchor?.focus({preventScroll:true});setAnchor(null);},[anchor]);
 const Icon=value==="alphabetical"?ArrowDownAZ:value==="spoken"?MessageCircle:FileText;
 const options:LibrarySort[]=["alphabetical","spoken","written"];
 return <><IconAction label={`${t.title}: ${t[value]}`} title={`${t.title}: ${t[value]}`} className={workspace.filterButton} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={event=>setAnchor(event.currentTarget)}><Icon size={18} aria-hidden="true"/></IconAction>
 {anchor&&<ActionMenu anchor={anchor} title={t.title} language={language} onClose={close} notice={t.help} items={options.map(id=>({id,label:t[id],description:id==="spoken"?t.spokenHelp:id==="written"?t.writtenHelp:undefined,icon:id===value?<Check size={14} aria-hidden="true"/>:undefined,onSelect:()=>{onChange(id);close();}}))}/>}</>;
}
