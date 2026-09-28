"use client";
import React,{useState} from "react";
import {ArrowUpRight,Check,Layers,Repeat2,Sparkles} from "lucide-react";
import s from "./statistics.module.css";
// Illustrative snapshots using the same five count concepts as the exercise stats read model.
// Scope aggregation / production wiring remains separate from this visual study.
const snapshots={words:{label:"Words",newCardsToday:8,reviewCardsDone:24,reviewCardsDue:12,totalCardsStarted:318,totalCardsInScope:2000},idioms:{label:"Idioms",newCardsToday:2,reviewCardsDone:9,reviewCardsDue:4,totalCardsStarted:46,totalCardsInScope:240}};
export function StatisticsPrototype({onTrain}:{onTrain:()=>void}){
 const [scope,setScope]=useState<keyof typeof snapshots>("words");
 const [empty,setEmpty]=useState(false);
 const fixture=snapshots[scope];
 const data=empty?{...fixture,newCardsToday:0,reviewCardsDone:0,reviewCardsDue:0,totalCardsStarted:0}:fixture;
 const progress=Math.round(data.totalCardsStarted/data.totalCardsInScope*100);
 return <section className={s.statistics} aria-label="Statistics">
  <header className={s.heading}><div><h1>Statistics</h1><p>A little practice adds up.</p></div><span className={s.demo}>Demo data</span></header>
  <div className={s.scope}><span>Dutch · Core vocabulary</span><div aria-label="Statistics scope" className={s.tabs}>{Object.entries(snapshots).map(([key,value])=><button key={key} aria-pressed={scope===key} onClick={()=>setScope(key as keyof typeof snapshots)}>{value.label}</button>)}</div></div>
  <section className={s.today} aria-labelledby="stats-today"><div className={s.sectionHeading}><h2 id="stats-today">Today</h2><span>Your current study day</span></div>
   <div className={s.metrics}>
    <Metric icon={<Sparkles size={16}/>} value={data.newCardsToday} label="New cards" note="Started today"/>
    <Metric icon={<Check size={16}/>} value={data.reviewCardsDone} label="Reviews completed" note="Review cards practised"/>
    <Metric icon={<Repeat2 size={16}/>} value={data.reviewCardsDue} label="Due now" note="Ready to review"/>
   </div>
  </section>
  <section className={s.progress} aria-labelledby="stats-progress"><div className={s.sectionHeading}><h2 id="stats-progress">Your progress</h2><Layers size={16}/></div>
   <p className={s.progressTotal}><strong>{data.totalCardsStarted.toLocaleString("en")}</strong><span>of {data.totalCardsInScope.toLocaleString("en")} cards started</span></p>
   <div className={s.bar} role="progressbar" aria-label="Cards started" aria-valuemin={0} aria-valuemax={data.totalCardsInScope} aria-valuenow={data.totalCardsStarted}><span style={{width:`${progress}%`}}/></div>
   <div className={s.legend}><span><i/>{progress}% started</span><span>{(data.totalCardsInScope-data.totalCardsStarted).toLocaleString("en")} not started</span></div>
   <p className={s.hint}>Started means you have begun practising a card. It does not mean you have mastered it.</p>
  </section>
  <section className={s.next}><div><h2>{empty?"Your first step starts here":data.reviewCardsDue?`${data.reviewCardsDue} cards ready when you are`:"You’re up to date"}</h2><p>{empty?"Start a session to begin building your progress.":"Continue at your own pace."}</p></div><button onClick={onTrain}>Go to training <ArrowUpRight size={15}/></button></section>
  <details className={s.notes}><summary>About these numbers</summary><p>Counts refer to cards in the selected scope, not unique words. New cards and completed reviews use the current study day; due cards reflect the current queue. This preview uses illustrative snapshots, not your account history.</p></details>
  <div className={s.preview}><span>Preview state</span><button aria-pressed={!empty} onClick={()=>setEmpty(false)}>With activity</button><button aria-pressed={empty} onClick={()=>setEmpty(true)}>First visit</button></div>
 </section>;
}
function Metric({icon,value,label,note}:{icon:React.ReactNode;value:number;label:string;note:string}){return <div className={s.metric}><span className={s.metricIcon}>{icon}</span><strong>{value}</strong><span className={s.metricLabel}>{label}</span><small>{note}</small></div>}
