"use client";
import React,{useContext,useState} from "react";
import {History,Check,ChevronDown,ChevronRight,X} from "lucide-react";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import {StatisticsActivity} from "@/components/practice/statistics/StatisticsActivity";
import {StatisticsCoverage,StatisticsQueue} from "@/components/practice/statistics/StatisticsMaterial";
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
 const [scopeOpen,setScopeOpen]=useState(false);
 const languageLabel=previewLanguageName(locale,language);
 const li=languages.indexOf(language);const setup=setups[scope];
 const due=empty?0:[18,12,4][scope]+li*2;const started=empty?0:Math.min(setup.total,[384,318,46][scope]+li*17);
 return <section className={s.statistics} lang={locale} aria-label={ui.navigation.statistics}><h1 className={s.srOnly}>{ui.navigation.statistics}</h1>
  <div className={s.languageRow}><div className={s.languageTabs} aria-label={copy.learningLanguage}>{languages.slice(0,3).map(name=><button key={name} aria-pressed={language===name} onClick={()=>setLanguage(name)}>{previewLanguageName(locale,name)}</button>)}<label className={s.moreLanguage} data-active={li>2}><span>{li>2?languageLabel:copy.more}</span><ChevronDown size={12}/><select aria-label={copy.moreLanguages} value={li>2?language:""} onChange={e=>setLanguage(e.target.value)}><option value="" disabled>{copy.otherLanguages}</option>{languages.slice(3).map(name=><option key={name} value={name}>{previewLanguageName(locale,name)}</option>)}</select></label></div></div>
  {scopeOpen&&<DialogSurface onDismiss={()=>setScopeOpen(false)} className={s.scopeDialog} aria-labelledby="scope-title"><div className={s.dialogInner}><div className={s.dialogHeading}><h2 id="scope-title">{copy.chooseMaterial}</h2><button aria-label={copy.closeSelection} onClick={()=>setScopeOpen(false)}><X size={18}/></button></div><p className={s.dialogHint}>{languageLabel} · {copy.learningMaterial}</p><div className={s.scopeOptions}>{setups.map((item,i)=><button key={item.name} aria-pressed={scope===i} onClick={()=>{setScope(i);setScopeOpen(false);}}><span><strong>{materialNames[i]}</strong><small>{descriptions[i]}</small></span>{scope===i&&<Check size={17}/>}</button>)}</div></div></DialogSurface>}
  <StatisticsActivity key={`${li}-${empty}`} interfaceLanguage={locale} calendar={illustrativeCalendar(li,empty)} recentActivity={onHistory&&<button className={s.recentActivity} onClick={onHistory}><History size={17}/>{copy.recentActivity}<ChevronRight size={15}/></button>}/>
  <div className={s.trainingScopes} aria-label={copy.material}><h2 className={s.materialTitle}>{copy.yourMaterial}</h2><p className={s.materialHint}>{copy.materialHint}</p><div className={s.languageTabs}>{setups.map((item,i)=><button key={item.name} aria-pressed={scope===i} onClick={()=>setScope(i)}>{i===0?copy.all:materialNames[i]}</button>)}<button className={s.scopeMore} aria-label={copy.chooseTrainingMaterial} aria-haspopup="dialog" onClick={()=>setScopeOpen(true)}><ChevronDown size={14}/></button></div></div>
  <StatisticsQueue interfaceLanguage={locale} due={due} description={scope===0?formatUiMessage(copy.allMaterial,{language:languageLabel}):`${languageLabel} · ${materialNames[scope]}`} practiseLabel={scope===0?copy.practiseAll:formatUiMessage(copy.practise,{material:materialNames[scope]})} onPractise={()=>onTrain(`${language} · ${setup.name}`)}/>
  <StatisticsCoverage interfaceLanguage={locale} started={started} total={setup.total} scopeLabel={scope===0?languageLabel:materialNames[scope]}/>
  <details className={s.notes}><summary>{copy.about}</summary><p>{copy.notes}</p></details><div className={s.preview} lang="en"><span>Demo data · Preview state</span><button aria-pressed={!empty} onClick={()=>setEmpty(false)}>With activity</button><button aria-pressed={empty} onClick={()=>setEmpty(true)}>First visit</button></div>
 </section>;
}
