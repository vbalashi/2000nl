"use client";
import React,{useContext,useState} from "react";
import {History,ChevronRight} from "lucide-react";
import {StatisticsActivity} from "@/components/practice/statistics/StatisticsActivity";
import {StatisticsCoverage,StatisticsQueue} from "@/components/practice/statistics/StatisticsMaterial";
import {StatisticsLanguageTabs,StatisticsMaterialPicker} from "@/components/practice/statistics/StatisticsScope";
import type {ActivityCalendar} from "@/lib/training/activity/model";
import {getUiMessages,formatUiMessage} from "@/lib/uiMessages";
import {InterfaceLanguageContext} from "./VariantControls";
import {previewLanguageName} from "./previewLanguage";
import s from "./statistics.module.css";
const languages=["Dutch","English","German","French","Spanish"];
const setups=[{name:"All learning",total:2480},{name:"2K",total:2000},{name:"Idioms",total:240}];
// Fixed, clearly illustrative year ending 28 September 2026. Future dates are not zero activity.
const today="2026-09-28";
const history=Array.from({length:366},(_,index)=>{const date=new Date(Date.UTC(2025,8,28+index));return {date:date.toISOString().slice(0,10),seed:date.getUTCFullYear()===2026&&date.getUTCMonth()===8?date.getUTCDate():index+31};});
function dayCounts(day:number,language:number,scope:number):{fresh:number;reviews:number}{if(scope===0){const a=dayCounts(day,language,1),b=dayCounts(day,language,2);return {fresh:a.fresh+b.fresh,reviews:a.reviews+b.reviews};}const active=day%6!==0;return {fresh:active?(day*3+language+scope)%9:0,reviews:active?(day*7+language*3+scope*5)%35:0};}
/** Fixture adapter only: illustrative minutes are derived from counts, unlike production. */
function illustrativeCalendar(language:number,empty:boolean):ActivityCalendar{
 return {timezone:"UTC",today,coverageStartedAt:"2025-01-01T00:00:00Z",days:history.map(({date,seed})=>{const c=empty?{fresh:0,reviews:0}:dayCounts(seed,language,0);return {date,newCount:c.fresh,reviewCount:c.reviews,activeMilliseconds:Math.round((c.fresh*35+c.reviews*18)/60)*60000};})};
}
export function StatisticsPrototype({onTrain,onHistory}:{onTrain:(name:string|null)=>void;onHistory?:()=>void}){
 const locale=useContext(InterfaceLanguageContext);const ui=getUiMessages(locale);const copy=ui.statistics;
 const materialNames=[copy.allLearning,"2K",copy.idioms];const descriptions=[copy.allDescription,copy.coreDescription,copy.idiomsDescription];
 const [language,setLanguage]=useState("Dutch");const [scope,setScope]=useState(0);const [empty,setEmpty]=useState(false);
 const languageLabel=previewLanguageName(locale,language);
 const li=languages.indexOf(language);const setup=setups[scope];
 const due=empty?0:[18,12,4][scope]+li*2;const started=empty?0:Math.min(setup.total,[384,318,46][scope]+li*17);
 return <section className={s.statistics} lang={locale} aria-label={ui.navigation.statistics}><h1 className={s.srOnly}>{ui.navigation.statistics}</h1>
  <StatisticsLanguageTabs interfaceLanguage={locale} languages={languages.map(name=>({id:name,label:previewLanguageName(locale,name)}))} value={language} onChange={setLanguage}/>
  <StatisticsActivity key={`${li}-${empty}`} interfaceLanguage={locale} calendar={illustrativeCalendar(li,empty)} recentActivity={onHistory&&<button className={s.recentActivity} onClick={onHistory}><History size={17}/>{copy.recentActivity}<ChevronRight size={15}/></button>}/>
  <StatisticsMaterialPicker interfaceLanguage={locale} languageLabel={languageLabel} options={setups.map((item,i)=>({id:String(i),label:materialNames[i],short:i===0?copy.all:undefined,description:descriptions[i]}))} value={String(scope)} onChange={id=>setScope(Number(id))}/>
  <StatisticsQueue interfaceLanguage={locale} due={due} description={scope===0?formatUiMessage(copy.allMaterial,{language:languageLabel}):`${languageLabel} · ${materialNames[scope]}`} practiseLabel={scope===0?copy.practiseAll:formatUiMessage(copy.practise,{material:materialNames[scope]})} onPractise={()=>onTrain(`${language} · ${setup.name}`)}/>
  <StatisticsCoverage interfaceLanguage={locale} started={started} total={setup.total} scopeLabel={scope===0?languageLabel:materialNames[scope]}/>
  <details className={s.notes}><summary>{copy.about}</summary><p>{copy.notes}</p></details><div className={s.preview} lang="en"><span>Demo data · Preview state</span><button aria-pressed={!empty} onClick={()=>setEmpty(false)}>With activity</button><button aria-pressed={empty} onClick={()=>setEmpty(true)}>First visit</button></div>
 </section>;
}
