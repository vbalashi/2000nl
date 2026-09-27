"use client";
import React,{useState,useEffect} from "react";
import {Search,SlidersHorizontal,X} from "lucide-react";
import {goedGroups} from "./GoedLibraryPreview";
import {LibraryArticle,Metadata,LibraryButton} from "./LibraryArticle";
import {LibraryStudyPanel} from "./LibraryStudyPanel";
import {LibraryStudy,studyDefaults,readStudy,studyUrl} from "./libraryStudy";
import type {LibrarySenseCardGroupModel} from "@/components/training/library-v2/librarySenseCardModel";
import additionalEntries from "./library-extra-fixture.json";
import s from "./library.module.css";
const words=[
 ...additionalEntries,
 ...goedGroups.map((g,index)=>({word:"goed",article:g.article||"",pos:g.partOfSpeech||"",translation:`${g.senseCount} ${g.senseCount===1?"meaning":"meanings"} · 2K`,definition:g.meanings[0]?.definition?.text||"",example:"",source:"VanDale",goedIndex:index})),
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
type Variant="compact"|"reading";
function toModel(w:typeof words[number]):LibrarySenseCardGroupModel{if("goedIndex" in w)return goedGroups[w.goedIndex as number];const meaning={entryId:w.word,cardTypeId:"word-to-definition" as const,displayOrdinal:1,partOfSpeech:w.pos,definition:{contentNodeId:w.word+"-d",parentContentNodeId:null,kind:"definition" as const,text:w.definition,children:[]},entryTranslation:null,entryTranslationAlternatives:[],translationStatus:null,details:[{contentNodeId:w.word+"-e",parentContentNodeId:null,kind:"example" as const,text:w.example,children:[]}],repeatCount:0,startLearning:null,markKnown:null,undoKnown:null,reportCapability:null};return {article:w.article,headword:w.word,partOfSpeech:w.pos,coreVocabularyLabel:null,audioCapability:null,senseCount:1,meanings:[meaning],crossReferences:[],presentations:[{kind:"sense-card",meaning}]};}
export function LibraryPrototype(){
 const [variant,setVariant]=useState<Variant>("compact");const [study,setStudy]=useState<LibraryStudy>(studyDefaults);
 const [query,setQuery]=useState("goed");const [source,setSource]=useState("All sources");const [filters,setFilters]=useState(false);const [selected,setSelected]=useState<string|null>("goed-noun");
 useEffect(()=>{const p=new URLSearchParams(location.search);if(p.get("layout")==="reading")setVariant("reading");setStudy(readStudy(p));},[]);
 function choose(v:Variant){setVariant(v);const u=new URL(location.href);u.searchParams.set("layout",v);history.replaceState(null,"",u);}
 function updateStudy(next:LibraryStudy){setStudy(next);studyUrl(next);}
 const results=words.filter(w=>(source==="All sources"||w.source===source)&&`${w.word} ${w.translation}`.toLowerCase().includes(query.toLowerCase()));const word=results.find(w=>`${w.word}-${w.pos}`===selected);
 return <section className={s.library} data-density={variant}><header className={s.heading}><h1>Library</h1></header>
 <div className={s.searchRow}><label className={s.search}><Search size={18}/><input aria-label="Search words" placeholder="Find a word or a meaning…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="Clear search" onClick={()=>setQuery("")}><X size={16}/></button>}</label><button className={`${s.filterButton} ${filters?s.active:""}`} aria-label="Search filters" aria-expanded={filters} onClick={()=>setFilters(!filters)}><SlidersHorizontal size={17}/></button></div>
 {filters&&<div className={s.filterPanel}><span>Dutch</span><label>Source<select value={source} onChange={e=>setSource(e.target.value)}>{["All sources","VanDale","Core vocabulary","Everyday Dutch"].map(v=><option key={v}>{v}</option>)}</select></label><LibraryButton onClick={()=>setFilters(false)}>Done</LibraryButton></div>}
 <div className={s.scope}><span>Dutch · {source}</span><span>{results.length} {results.length===1?"entry":"entries"}</span></div>
 <div className={`${s.workspace} ${word?s.hasDetail:""}`}><div className={s.list} aria-label="Dictionary entries">{results.map(w=>{const m=toModel(w);return <button key={`${w.word}-${w.pos}`} className={s.row} aria-pressed={selected===`${w.word}-${w.pos}`} onClick={()=>setSelected(`${w.word}-${w.pos}`)}><span className={s.rowMain}><span className={s.word}>{w.article&&<span>{w.article} </span>}{w.word}</span><Metadata pos={w.pos} core={m.coreVocabularyLabel}/></span><span className={s.count} aria-label={`${m.senseCount} ${m.senseCount===1?"meaning":"meanings"}`} title={`${m.senseCount} ${m.senseCount===1?"meaning":"meanings"}`}>{m.senseCount}</span>{variant==="reading"&&<span className={s.snippet}>{w.definition}</span>}</button>})}{!results.length&&<div className={s.empty}><h2>No matching words</h2><LibraryButton onClick={()=>{setQuery("");setSource("All sources");}}>Clear search and filters</LibraryButton></div>}</div>
 {word&&<LibraryArticle key={`${word.word}-${word.pos}`} model={toModel(word)} source={word.source} study={study} onClose={()=>setSelected(null)}/>}
 </div>
 <LibraryStudyPanel study={study} onChange={updateStudy} density={variant} onDensity={choose} onBrowse={()=>{setQuery("");setSelected("goed-noun");}}/>

 </section>;
}
