"use client";
import React from "react";
import {Search} from "lucide-react";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import type {CollectionSort} from "@/lib/collections/labels/catalog";
import {CollectionSortControl} from "../organization/CollectionSortControl";
import {localizedSection} from "@/lib/i18n/catalog";
import s from "../organization/organization.module.css";

export type SharedCatalogSelection={query:string;sort:CollectionSort;searchInputRef:React.RefObject<HTMLInputElement>};
export function SharedCatalogControls({locale,selection,onQueryChange,onSortChange}:{locale:OnboardingLanguage;selection:SharedCatalogSelection;onQueryChange:(query:string)=>void;onSortChange:(sort:CollectionSort)=>void}){
 const t=localizedSection('sharedWorkspace')[locale];
 return <div className={s.filters}><label className={s.search}><Search size={16} aria-hidden="true"/><input ref={selection.searchInputRef} aria-label={t.search} placeholder={t.search} maxLength={100} value={selection.query} onChange={event=>onQueryChange(event.target.value)}/></label><CollectionSortControl locale={locale} value={selection.sort} onChange={onSortChange}/></div>;
}
