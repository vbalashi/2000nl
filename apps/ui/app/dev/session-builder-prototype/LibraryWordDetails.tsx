"use client";
import React,{useContext} from "react";
import type {LibrarySenseCardGroupModel} from "@/components/training/library-v2/librarySenseCardModel";
import {ArticleWordForms,ArticleSenseRelations} from "@/components/practice/article/ArticleWordDetails";
import {InterfaceLanguageContext} from "./VariantControls";
import fixture from "./word-details-fixture.json";
export const detailGroups=fixture.groups as LibrarySenseCardGroupModel[];
type Form = {label:string;value:string};
type Detail = {forms:Form[];conjugation:Record<string,Record<string,string>>;pos:string;relations:Record<string,{synonyms?:string[];antonyms?:string[]}>};
const details:Record<string,Detail> = fixture.details;
const relationsByEntry=Object.fromEntries(Object.values(details).flatMap(detail=>Object.entries(detail.relations)));

export function WordForms({model,...props}:{model:LibrarySenseCardGroupModel;variant?:"primary"|"complete";part:"summary"|"body";open:boolean;onToggle:()=>void;id:string}){
 return <ArticleWordForms {...props} detail={details[`${model.headword}-${model.partOfSpeech}`]??null} headword={model.headword} interfaceLanguage={useContext(InterfaceLanguageContext)} contentLanguage="nl"/>;
}
export function SenseRelations({entryId,compact=false}:{entryId:string;compact?:boolean}){
 return <ArticleSenseRelations relation={Object.fromEntries(Object.entries(relationsByEntry[entryId]??{}).map(([kind,values])=>[kind,values.map((text,index)=>({relationId:`${entryId}:${kind}:${index}`,text}))]))} compact={compact} interfaceLanguage={useContext(InterfaceLanguageContext)} contentLanguage="nl"/>;
}
