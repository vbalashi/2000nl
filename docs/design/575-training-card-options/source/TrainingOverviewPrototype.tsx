'use client';
// THROWAWAY: three fixed-hero variants. Illustrative counters, no scheduler mutations.
import React,{useState,useRef,useEffect} from 'react';
import {ChevronDown,ChevronLeft,ChevronRight,SlidersHorizontal,Play} from 'lucide-react';
import s from './trainingOverviewPrototype.module.css';
const variants=['A','B','C'];
export function TrainingOverviewPrototype({variant, names}:{variant:string;names:string[]}){
 const [selected,setSelected]=useState(0),[loading,setLoading]=useState(false),[empty,setEmpty]=useState(false),[theme,setTheme]=useState(false);
 const [more,setMore]=useState(true);const list=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>>();
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const load=(i:number)=>{clearTimeout(timer.current);setSelected(i);setLoading(true);timer.current=setTimeout(()=>setLoading(false),1100);};
 const totals=selected%3===0?[0,142,286]:[12+selected,142+selected*3,286-selected];
 const label=names[selected%Math.max(1,names.length)]||'Translation';
 const cycle=(direction:number)=>{const url=new URL(location.href);url.searchParams.set('trainingPrototype',variants[(variants.indexOf(variant)+direction+3)%3]);location.assign(url.toString());};
 return <div className={`${s.workspace} ${s[variant]} ${theme?s.dark:''}`}>
 <section className={s.hero} aria-label="Selected training preview">
 <div className={s.top}><span>DUTCH</span><button aria-label="Training settings"><SlidersHorizontal size={17}/></button></div>
 <div className={s.title}><h2>{label}</h2><p>Translation · Reviews only · Up to 5 cards</p></div>
 <div className={s.metrics} aria-busy={loading}>{['Due today','Total reviews','Still to learn'].map((text,i)=><div key={text}><strong className={loading?s.wave:''}>{loading?'—':totals[i]}</strong><span>{text}</span></div>)}</div>
 <button className={s.start}><Play size={16}/>{totals[0]===0?'Review ahead':'Start training'}</button>
 </section>
 <section className={s.saved}><div className={s.savedTitle}><h3>Saved Trainings</h3><button>＋ Create training</button></div>
 {empty?<div className={s.empty}>No saved trainings yet.<br/><span>Create a training to keep its settings here.</span></div>:<><div ref={list} className={s.scroll} onScroll={()=>{const el=list.current;setMore(!!el&&el.scrollTop+el.clientHeight<el.scrollHeight-3);}}>{Array.from({length:100},(_,i)=><div className={`${s.row} ${selected===i?s.selected:''}`} key={i}><div><h4>{names[i%Math.max(1,names.length)]||'Translation'}{i>=names.length?` ${i+1}`:''}</h4><p>Dutch · Reviews only · Up to 5 cards</p></div><button aria-label={`Load training ${i+1}`} onClick={()=>load(i)}>{selected===i?'Selected':'Load'}</button></div>)}</div>{more&&<div className={s.fade}><button aria-label="More saved trainings" onClick={()=>list.current?.scrollBy({top:200,behavior:'smooth'})}><ChevronDown size={18}/></button></div>}</>}
 </section>
 <div className={s.switcher}><button aria-label="Previous variant" onClick={()=>cycle(-1)}><ChevronLeft size={16}/></button><span>{variant} · Prototype · Sample counts</span><button aria-label="Next variant" onClick={()=>cycle(1)}><ChevronRight size={16}/></button><button onClick={()=>setEmpty(!empty)}>{empty?'100 saved':'No saved'}</button><button onClick={()=>setTheme(!theme)}>Theme</button></div>
 </div>;
}
