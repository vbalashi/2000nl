"use client";
import React,{useState} from "react";
import {Search,SlidersHorizontal,X,ArrowLeft,BookOpen,ChevronRight} from "lucide-react";
import s from "./library.module.css";
const words=[
 {word:"aandacht",article:"de",pos:"noun",translation:"attention",definition:"Het richten van je gedachten op iemand of iets.",example:"Ze luistert met aandacht naar het verhaal.",source:"Everyday Dutch"},
 {word:"afspreken",article:"",pos:"verb",translation:"to arrange · to agree",definition:"Samen bepalen wat je gaat doen, waar en wanneer.",example:"We spreken af om morgen samen te fietsen.",source:"Everyday Dutch"},
 {word:"bijzonder",article:"",pos:"adjective",translation:"special · unusual",definition:"Anders dan gewoon; iets wat opvalt.",example:"Het was een bijzondere dag.",source:"Core vocabulary"},
 {word:"fiets",article:"de",pos:"noun",translation:"bicycle",definition:"Een voertuig met twee wielen waarop je trapt om vooruit te komen.",example:"Ik ga elke dag met de fiets naar mijn werk.",source:"Core vocabulary"},
 {word:"gezellig",article:"",pos:"adjective",translation:"cosy · pleasant",definition:"Met een prettige, ontspannen sfeer.",example:"We hadden een gezellige avond met vrienden.",source:"Everyday Dutch"},
 {word:"huis",article:"het",pos:"noun",translation:"house",definition:"Een gebouw waarin mensen wonen.",example:"Ons huis staat naast het park.",source:"Core vocabulary"},
 {word:"onderweg",article:"",pos:"adverb",translation:"on the way",definition:"Tijdens de reis naar een bestemming.",example:"Ik ben onderweg naar huis.",source:"Everyday Dutch"},
 {word:"ontmoeten",article:"",pos:"verb",translation:"to meet",definition:"Iemand zien en met die persoon in contact komen.",example:"Morgen ontmoet ik mijn nieuwe collega.",source:"Core vocabulary"},
 {word:"rustig",article:"",pos:"adjective",translation:"quiet · calm",definition:"Zonder drukte, lawaai of haast.",example:"Het is hier rustig in de ochtend.",source:"Everyday Dutch"},
 {word:"wandelen",article:"",pos:"verb",translation:"to walk",definition:"Lopen voor je plezier.",example:"We wandelen graag door het bos.",source:"Core vocabulary"},
 {word:"weer",article:"het",pos:"noun",translation:"weather",definition:"De toestand van de lucht buiten, zoals regen, wind en zon.",example:"Vandaag is het mooi weer.",source:"Core vocabulary"},
 {word:"zin",article:"de",pos:"noun",translation:"sentence",definition:"Een groep woorden die samen iets betekent.",example:"Lees de eerste zin nog een keer.",source:"Core vocabulary"}
];
export function LibraryPrototype(){
 const [query,setQuery]=useState("");const [source,setSource]=useState("All sources");const [filters,setFilters]=useState(false);const [selected,setSelected]=useState<string|null>(null);
 const results=words.filter(w=>(source==="All sources"||w.source===source)&&`${w.word} ${w.translation}`.toLowerCase().includes(query.toLowerCase()));const word=words.find(w=>w.word===selected);
 return <section className={s.library}><header className={s.heading}><div><h1>Library</h1><p>Your words, ready to explore.</p></div><span className={s.demo}>Sample collection · 12 entries</span></header>
 <div className={s.searchRow}><label className={s.search}><Search size={19}/><input aria-label="Search words" placeholder="Find a word or a meaning…" value={query} onChange={e=>{setQuery(e.target.value);setSelected(null);}}/>{query&&<button aria-label="Clear search" onClick={()=>setQuery("")}><X size={16}/></button>}</label><button className={`${s.filterButton} ${filters?s.active:""}`} aria-label="Search filters" aria-expanded={filters} onClick={()=>setFilters(!filters)}><SlidersHorizontal size={18}/>{source!=="All sources"&&<i/>}</button></div>
 {filters&&<div className={s.filterPanel}><div><span>Learning language</span><strong>Dutch</strong></div><label>Source<select value={source} onChange={e=>{setSource(e.target.value);setSelected(null);}}>{["All sources","Core vocabulary","Everyday Dutch"].map(v=><option key={v}>{v}</option>)}</select></label><button onClick={()=>setFilters(false)}>Done</button></div>}
 <div className={s.scope}><span>Dutch <b>·</b> {source}</span><span>{results.length} {results.length===1?"entry":"entries"}</span></div>
 <div className={`${s.workspace} ${word?s.hasDetail:""}`}><div className={s.list} aria-label="Dictionary entries">{results.map(w=><button key={w.word} className={s.row} aria-pressed={selected===w.word} onClick={()=>setSelected(w.word)}><span className={s.word}><small>{w.article}{w.article?" ":""}</small>{w.word}</span><span className={s.translation}>{w.translation}</span><span className={s.pos}>{w.pos}</span><ChevronRight size={15}/></button>)}{!results.length&&<div className={s.empty}><Search size={26}/><h2>No matching words</h2><p>Try another spelling or search all sources.</p><button onClick={()=>{setQuery("");setSource("All sources");}}>Clear search and filters</button></div>}</div>
 {word&&<article className={s.detail} aria-label="Word details"><header><span><BookOpen size={14}/>{word.source}</span><button aria-label="Close word details" onClick={()=>setSelected(null)}><X size={18}/></button></header><button className={s.mobileBack} onClick={()=>setSelected(null)}><ArrowLeft size={16}/> All words</button><div className={s.meta}><i/>{word.pos}</div><h2><small>{word.article}{word.article?" ":""}</small>{word.word}</h2><p className={s.meaning}>{word.definition}</p><p className={s.gloss}>{word.translation}</p><div className={s.example}><span>EXAMPLE</span><p>{word.example}</p></div><footer>In {word.source}</footer></article>}
 </div></section>;
}
