"use client";
import React from "react";
import {Pencil} from "lucide-react";
import {SearchField} from "@/components/practice/ui/SearchField";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {getUiMessages} from "@/lib/uiMessages";
import {fetchDictionaryCategoryPage, type DictionaryCategoryHit} from "@/lib/platform/dictionaryCategorySearch";
import s from "./personalReferencePicker.module.css";

export function PersonalReferencePicker({text, languageCode, locale, label, onChoose, remove}: {
  text:string; languageCode:string; locale:OnboardingLanguage; label:string;
  onChoose:(text:string,entryId:string)=>void; remove:React.ReactNode;
}) {
  const copy=getUiMessages(locale);
  const [open,setOpen]=React.useState(!text);
  const [query,setQuery]=React.useState("");
  const [hits,setHits]=React.useState<DictionaryCategoryHit[]>([]);
  const [status,setStatus]=React.useState<"ready"|"loading"|"failed">("ready");
  React.useEffect(()=>{
    const controller=new AbortController();
    setHits([]);setStatus("ready");
    if(!open || !query.trim())return;
    setStatus("loading");
    const timer=setTimeout(async()=>{
      try {
        const page=await fetchDictionaryCategoryPage({query:query.trim(),languageCode,dictionaryId:null,signal:controller.signal},"headwords");
        if(!controller.signal.aborted){setHits(page.items);setStatus("ready");}
      } catch {if(!controller.signal.aborted)setStatus("failed");}
    },180);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[open,query,languageCode]);
  return <div>
    <div className={s.bar}>{open ? <SearchField><input autoFocus maxLength={100} value={query} aria-label={label}
      placeholder={copy.library.searchPlaceholder} onChange={e=>{setHits([]);setQuery(e.target.value);}}
      onKeyDown={e=>{if(e.key==="Escape" && text)setOpen(false);}}/></SearchField> :
      <button type="button" className={s.selected} onClick={()=>{setQuery("");setOpen(true);}}>{text}<Pencil size={13}/></button>}
      <span className={s.remove}>{remove}</span>
    </div>
    {open && query.trim() && <div className={s.choices} aria-live="polite">
      {status==="loading"?copy.librarySearch.loadingMore:status==="failed"?copy.librarySearch.error:!hits.length?copy.librarySearch.empty:
        hits.map(hit=><button key={hit.entry.id} type="button" onClick={()=>{
          onChoose(hit.entry.headword,hit.entry.id);setOpen(false);
        }}><strong>{hit.entry.headword}</strong><span>{[hit.entry.summaryDefinition,hit.dictionary?.name].filter(Boolean).join(" · ")}</span></button>)}
    </div>}
  </div>;
}
