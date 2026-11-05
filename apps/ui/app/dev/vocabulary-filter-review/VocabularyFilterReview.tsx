"use client";
import React, { useEffect, useState } from "react";
import { LibraryPresentationContext } from "@/components/practice/library/LibraryPresentationContext";
import { TrainingBuilderPresentationContext } from "@/components/practice/builder/TrainingBuilderPresentationContext";
import { MaterialKindSelection, MaterialKindHelp, materialKindSummary } from "@/components/practice/vocabulary/MaterialKindSelection";
import { VocabularySelectionFields } from "@/components/practice/vocabulary/VocabularySelectionFields";
import { LibrarySortControl, type LibrarySort } from "@/components/practice/library/LibrarySortControl";
import { BuilderSection } from "@/components/practice/builder/BuilderSection";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { DEFAULT_VOCABULARY_SELECTION, type VocabularySelection } from "@/lib/vocabulary/selection";
import s from "./review.module.css";
const initial:VocabularySelection={...DEFAULT_VOCABULARY_SELECTION,mode:"frequency" as const,meanings:2 as const};
const copy={ru:{title:"Отбор слов и значения",note:"Новые настройки показаны для проверки интерфейса. На выборку пока не влияют."},en:{title:"Words and meanings",note:"These new controls are for interface review. They do not change the selection yet."},nl:{title:"Woorden en betekenissen",note:"Deze nieuwe instellingen zijn voor de interfacebeoordeling. Ze wijzigen de selectie nog niet."}};
/** Mount the actual app with its auth, preferences, navigation and real local data.
 * Only the proposed additions are local review state; no fake app shell or dataset.
 */
export function VocabularyFilterReview({children}:{children:React.ReactNode}){
 const [applied,setApplied]=useState(initial),[draft,setDraft]=useState(initial),[training,setTraining]=useState(initial);
 const [sort,setSort]=useState<LibrarySort>("alphabetical"),[open,setOpen]=useState(true),[materialOpen,setMaterialOpen]=useState(true);
 const fields=(language:OnboardingLanguage,value:VocabularySelection,onChange:(value:VocabularySelection)=>void)=><><VocabularySelectionFields language={language} value={value} onChange={onChange}/><p className={s.note}>{copy[language].note}</p></>;
 return <LibraryPresentationContext.Provider value={{
   renderSearchActions:language=><LibrarySortControl language={language} value={sort} onChange={setSort} reviewNotice={{ru:"Проверка вида: порядок слов пока не меняется",en:"UI review: word order does not change yet",nl:"Interfacebeoordeling: de woordvolgorde blijft gelijk"}[language]}/>,
   renderAdditionalFilters:language=><><BuilderSection title={{ru:"Материал",en:"Material",nl:"Materiaal"}[language]} summary={materialKindSummary(draft.materialKinds,language)} headerActions={<MaterialKindHelp language={language}/>} open={materialOpen} onToggle={()=>setMaterialOpen(current=>!current)}><MaterialKindSelection value={draft.materialKinds} onChange={materialKinds=>setDraft(current=>({...current,materialKinds}))} language={language}/></BuilderSection><BuilderSection title={copy[language].title} summary="" open={open} onToggle={()=>setOpen(current=>!current)}>{fields(language,draft,setDraft)}</BuilderSection></>,
   onApplyAdditionalFilters:()=>setApplied(draft),onDismissAdditionalFilters:()=>setDraft(applied),onResetAdditionalFilters:()=>setDraft(DEFAULT_VOCABULARY_SELECTION),
 }}><TrainingBuilderPresentationContext.Provider value={{renderAdditionalFilters:language=><div className={s.trainingFields}>{fields(language,training,setTraining)}</div>}}>{children}</TrainingBuilderPresentationContext.Provider></LibraryPresentationContext.Provider>;
}

/** No additional DOM or state owner on the ordinary app route. */
export function VocabularyFilterReviewBoundary({children}:{children:React.ReactNode}){
 const [enabled,setEnabled]=useState(false);
 useEffect(()=>{setEnabled(process.env.NODE_ENV==="development"&&new URL(window.location.href).searchParams.get("vocabulary-review")==="1");},[]);
 return enabled?<VocabularyFilterReview>{children}</VocabularyFilterReview>:children;
}
