"use client";
import React,{useContext,useState} from "react";
import {History,ArrowUpRight,Check,ChevronDown,ChevronLeft,ChevronRight,X} from "lucide-react";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import {getUiMessages,formatUiMessage,formatUiCount} from "@/lib/uiMessages";
import {InterfaceLanguageContext} from "./VariantControls";
import {previewLanguageName} from "./previewLanguage";
import s from "./statistics.module.css";
const languages=["Dutch","English","German","French","Spanish"];
const setups=[{name:"All learning",total:2480},{name:"2K",total:2000},{name:"Idioms",total:240}];
// Fixed, clearly illustrative September 2026 history. Future dates are not zero activity.
const today=28;
const history=Array.from({length:365},(_,index)=>{const date=new Date(Date.UTC(2025,8,29+index));return {date,seed:date.getUTCFullYear()===2026&&date.getUTCMonth()===8?date.getUTCDate():index+31};});
function dayCounts(day:number,language:number,scope:number):{fresh:number;reviews:number}{if(scope===0){const a=dayCounts(day,language,1),b=dayCounts(day,language,2);return {fresh:a.fresh+b.fresh,reviews:a.reviews+b.reviews};}const active=day%6!==0;return {fresh:active?(day*3+language+scope)%9:0,reviews:active?(day*7+language*3+scope*5)%35:0};}
export function StatisticsPrototype({onTrain,onHistory}:{onTrain:(name:string|null)=>void;onHistory?:()=>void}){
 const locale=useContext(InterfaceLanguageContext);const ui=getUiMessages(locale);const copy=ui.statistics;
 const numberFormat=new Intl.NumberFormat(locale);
 const dateFormat=new Intl.DateTimeFormat(locale,{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"});
 const number=(value:number)=>numberFormat.format(value);
 const dateLabel=(date:Date)=>dateFormat.format(date);
 const dateRange=(first:Date,last:Date)=>dateFormat.formatRange(first,last);
 const materialNames=[copy.allLearning,"2K",copy.idioms];const descriptions=[copy.allDescription,copy.coreDescription,copy.idiomsDescription];
 const monthLabels=history.flatMap((day,index)=>day.date.getUTCDate()===1?[{id:index,label:day.date.toLocaleDateString(locale,{month:"short",timeZone:"UTC"}),column:Math.floor(index/7)+1}]:[]);
 const [language,setLanguage]=useState("Dutch");const [scope,setScope]=useState(0);const [period,setPeriod]=useState<"Today"|"Week"|"Month">("Week");const [selectedDay,setSelectedDay]=useState<number|null>(null);const [empty,setEmpty]=useState(false);
 const [scopeOpen,setScopeOpen]=useState(false);
 const languageLabel=previewLanguageName(locale,language);
 const li=languages.indexOf(language);const setup=setups[scope];
 const counts=(day:number)=>empty?{fresh:0,reviews:0}:dayCounts(day,li,0);
 // Illustrative active study duration, not inferred production telemetry.
 const minutes=(day:number)=>{const c=counts(day);return Math.round((c.fresh*35+c.reviews*18)/60);};
 const start=period==="Today"?today:period==="Week"?22:1;
 const dates=Array.from({length:today-start+1},(_,i)=>i+start);
 const aggregate=dates.reduce((sum,day)=>{const c=counts(day);return {fresh:sum.fresh+c.fresh,reviews:sum.reviews+c.reviews};},{fresh:0,reviews:0});
 const due=empty?0:[18,12,4][scope]+li*2;const started=empty?0:Math.min(setup.total,[384,318,46][scope]+li*17);const pct=Math.round(started/setup.total*100);
 const [historyPage,setHistoryPage]=useState(0);
 const mobileStart=new Date(Date.UTC(2026,7-historyPage*2,1));
 const mobileEnd=new Date(Date.UTC(2026,9-historyPage*2,1));
 const mobileDays=history.map((day,index)=>({...day,index})).filter(day=>day.date>=mobileStart&&day.date<mobileEnd);
 const mobileMonths=[mobileStart,new Date(Date.UTC(2026,8-historyPage*2,1))].map(date=>date.toLocaleDateString(locale,{month:"short",year:"numeric",timeZone:"UTC"})).join(" – ");
 const totals=history.map(day=>{const c=counts(day.seed);return c.fresh+c.reviews;});
 let longest=0,run=0;for(const total of totals){run=total>0?run+1:0;longest=Math.max(longest,run);}
 let streak=0;for(let i=totals.length-1-(totals.at(-1)===0?1:0);i>=0&&totals[i]>0;i--)streak++;
 const average=Math.round(totals.slice(-30).reduce((sum,n)=>sum+n,0)/30);
 const daySummary=(day:number)=>{const c=counts(day);return formatUiMessage(copy.daySummary,{fresh:number(c.fresh),reviews:number(c.reviews),minutes:formatUiMessage(copy.minutes,{count:number(minutes(day))})});};
 const heatDay=(day:typeof history[number],index:number)=>{const c=counts(day.seed),total=c.fresh+c.reviews;const label=formatUiMessage(copy.dayAccessible,{date:dateLabel(day.date),summary:daySummary(day.seed)});return <button key={index} data-level={total===0?0:total<15?1:total<30?2:3} aria-pressed={selectedDay===index} aria-label={label} title={label} onClick={()=>setSelectedDay(index)}/>;};
 const chosen=selectedDay===null?null:counts(history[selectedDay].seed);
 return <section className={s.statistics} lang={locale} aria-label={ui.navigation.statistics}><h1 className={s.srOnly}>{ui.navigation.statistics}</h1>
  <div className={s.languageRow}><div className={s.languageTabs} aria-label={copy.learningLanguage}>{languages.slice(0,3).map(name=><button key={name} aria-pressed={language===name} onClick={()=>setLanguage(name)}>{previewLanguageName(locale,name)}</button>)}<label className={s.moreLanguage} data-active={li>2}><span>{li>2?languageLabel:copy.more}</span><ChevronDown size={12}/><select aria-label={copy.moreLanguages} value={li>2?language:""} onChange={e=>setLanguage(e.target.value)}><option value="" disabled>{copy.otherLanguages}</option>{languages.slice(3).map(name=><option key={name} value={name}>{previewLanguageName(locale,name)}</option>)}</select></label></div></div>
  {scopeOpen&&<DialogSurface onDismiss={()=>setScopeOpen(false)} className={s.scopeDialog} aria-labelledby="scope-title"><div className={s.dialogInner}><div className={s.dialogHeading}><h2 id="scope-title">{copy.chooseMaterial}</h2><button aria-label={copy.closeSelection} onClick={()=>setScopeOpen(false)}><X size={18}/></button></div><p className={s.dialogHint}>{languageLabel} · {copy.learningMaterial}</p><div className={s.scopeOptions}>{setups.map((item,i)=><button key={item.name} aria-pressed={scope===i} onClick={()=>{setScope(i);setScopeOpen(false);}}><span><strong>{materialNames[i]}</strong><small>{descriptions[i]}</small></span>{scope===i&&<Check size={17}/>}</button>)}</div></div></DialogSurface>}
  <section className={s.today} aria-labelledby="stats-activity"><div className={s.sectionHeading}><h2 id="stats-activity">{copy.activity}</h2><div className={s.tabs} aria-label={copy.activityPeriod}>{(["Today","Week","Month"] as const).map(value=><button key={value} aria-pressed={period===value} onClick={()=>{setPeriod(value);setSelectedDay(null);}}>{copy.periods[value]}</button>)}</div></div>
   <p className={s.range}>{dateRange(new Date(Date.UTC(2026,8,start)),new Date(Date.UTC(2026,8,today)))}</p>
   <div className={s.activityNumbers}><Metric value={aggregate.fresh} label={copy.newExercises}/><Metric value={aggregate.reviews} label={copy.reviewsCompleted}/><Metric value={dates.filter(d=>{const c=counts(d);return c.fresh+c.reviews>0;}).length} label={copy.activeDays}/><Metric value={formatUiMessage(copy.minutes,{count:number(dates.reduce((sum,day)=>sum+minutes(day),0))})} label={copy.studyTime}/></div>
  </section>
  {onHistory&&<button className={s.recentActivity} onClick={onHistory}><History size={17}/>{copy.recentActivity}<ChevronRight size={15}/></button>}
  <section className={s.history} aria-labelledby="history-title"><div className={s.sectionHeading}><h2 id="history-title">{copy.studyActivity}</h2><span>{dateRange(history[0].date,history[history.length-1].date)}</span></div><div className={s.desktopHeat}><div className={s.heatScroll}><div className={s.heatGrid} aria-label={copy.yearHeatmap}>{history.map(heatDay)}</div><div className={s.monthLabels}>{monthLabels.map(item=><span key={item.id} style={{gridColumn:item.column}}>{item.label}</span>)}</div></div></div>
   <div className={s.mobileHeat}><div className={s.mobileHistoryNav}><button aria-label={copy.earlierMonths} disabled={historyPage===5} onClick={()=>{setHistoryPage(p=>p+1);setSelectedDay(null);}}><ChevronLeft size={16}/></button><span>{mobileMonths}</span><button aria-label={copy.laterMonths} disabled={historyPage===0} onClick={()=>{setHistoryPage(p=>p-1);setSelectedDay(null);}}><ChevronRight size={16}/></button></div><div className={s.mobileHeatGrid} aria-label={copy.monthHeatmap}>{Array.from({length:mobileDays.length?(mobileDays[0].date.getUTCDay()+6)%7:0},(_,i)=><span key={`blank-${i}`}/>)}{mobileDays.map(day=>heatDay(day,day.index))}</div></div>
   <div className={s.heatLegend}><span>{copy.less}</span>{[0,1,2,3].map(level=><i key={level} data-level={level}/>)}<span>{copy.moreActivity}</span></div>
   <div className={s.dayDetail} aria-live="polite">{chosen&&selectedDay!==null?<><strong>{dateLabel(history[selectedDay].date)}</strong><span>{daySummary(history[selectedDay].seed)}{chosen.fresh+chosen.reviews===0?` · ${copy.noActivity}`:""}</span></>:<span>{copy.selectDay}</span>}</div>
  </section>
  <section aria-labelledby="stats-highlights"><h2 id="stats-highlights" className={s.highlightsTitle}>{copy.highlights}</h2><div className={s.highlights}><Metric value={formatUiCount(locale,streak,copy,"day")} label={copy.currentStreak}/><Metric value={formatUiCount(locale,longest,copy,"day")} label={copy.longestStreak}/><Metric value={Math.max(...totals)} label={copy.bestDay}/><Metric value={average} label={copy.average}/></div></section>
  <div className={s.trainingScopes} aria-label={copy.material}><h2 className={s.materialTitle}>{copy.yourMaterial}</h2><p className={s.materialHint}>{copy.materialHint}</p><div className={s.languageTabs}>{setups.map((item,i)=><button key={item.name} aria-pressed={scope===i} onClick={()=>setScope(i)}>{i===0?copy.all:materialNames[i]}</button>)}<button className={s.scopeMore} aria-label={copy.chooseTrainingMaterial} aria-haspopup="dialog" onClick={()=>setScopeOpen(true)}><ChevronDown size={14}/></button></div></div>
  <section className={s.queue}><div><span className={s.queueLabel}>{copy.dueNow}</span><h2>{formatUiCount(locale,due,copy,"ready")}</h2><p>{scope===0?formatUiMessage(copy.allMaterial,{language:languageLabel}):`${languageLabel} · ${materialNames[scope]}`} · {copy.readyNow}</p></div><button onClick={()=>onTrain(`${language} · ${setup.name}`)}>{scope===0?copy.practiseAll:formatUiMessage(copy.practise,{material:materialNames[scope]})}<ArrowUpRight size={15}/></button></section>
  <section className={s.progress} aria-labelledby="stats-progress"><div className={s.sectionHeading}><h2 id="stats-progress">{copy.coverage}</h2><span>{scope===0?languageLabel:materialNames[scope]}</span></div><p className={s.progressTotal}><strong>{number(started)}</strong><span>{formatUiMessage(copy.ofCards,{total:number(setup.total)})}</span></p><div className={s.bar} role="progressbar" aria-label={copy.cardsStarted} aria-valuemin={0} aria-valuemax={setup.total} aria-valuenow={started}><span style={{width:`${pct}%`}}/></div><div className={s.legend}><span>{formatUiMessage(copy.started,{percent:new Intl.NumberFormat(locale,{style:"percent"}).format(pct/100)})}</span><span>{formatUiMessage(copy.notStarted,{count:number(setup.total-started)})}</span></div><p className={s.hint}>{copy.coverageHint}</p></section>
  <details className={s.notes}><summary>{copy.about}</summary><p>{copy.notes}</p></details><div className={s.preview} lang="en"><span>Demo data · Preview state</span><button aria-pressed={!empty} onClick={()=>setEmpty(false)}>With activity</button><button aria-pressed={empty} onClick={()=>setEmpty(true)}>First visit</button></div>
 </section>;
}
function Metric({value,label}:{value:number|string;label:string}){const locale=useContext(InterfaceLanguageContext);return <div><strong>{typeof value==="number"?new Intl.NumberFormat(locale).format(value):value}</strong><span>{label}</span></div>}
