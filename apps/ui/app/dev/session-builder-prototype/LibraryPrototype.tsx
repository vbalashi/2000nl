"use client";
import React,{useContext,useState,useEffect,useRef} from "react";
import {Search,SlidersHorizontal,X} from "lucide-react";
import {goedGroups} from "./GoedLibraryPreview";
import {LibraryArticle,LibraryButton} from "./LibraryArticle";
import {DemoCollectionsProvider} from "./LibraryOverlays";
import {LibraryStudyPanel} from "./LibraryStudyPanel";
import {LibraryStudy,studyDefaults,readStudy,studyUrl} from "./libraryStudy";
import type {LibrarySenseCardGroupModel} from "@/components/training/library-v2/librarySenseCardModel";
import {demoWordTranslations} from "./libraryTranslationFixture";
import additionalEntries from "./library-extra-fixture.json";
import {getUiMessages,formatUiCount} from "@/lib/uiMessages";
import {InterfaceLanguageContext} from "./VariantControls";
import s from "./library.module.css";
import {LibraryResultList,LibraryResultRow} from "@/components/practice/library/LibraryResultList";
import {LibraryFilters,defaultLibraryFilter,matchesLibraryFilter,libraryFilterSummary} from "./LibraryFilters";
import {detailGroups} from "./LibraryWordDetails";
const words=[
 ...detailGroups.map((g,detailIndex)=>({word:g.headword,article:g.article||"",pos:g.partOfSpeech||"",translation:"",definition:g.meanings[0]?.definition?.text||"",example:"",source:"VanDale",detailIndex})),
 ...additionalEntries.filter(w=>!detailGroups.some(g=>g.headword===w.word&&g.partOfSpeech===w.pos)),
 ...goedGroups.map((g,index)=>({word:"goed",article:g.article||"",pos:g.partOfSpeech||"",translation:`${g.senseCount} ${g.senseCount===1?"meaning":"meanings"} · 2K`,definition:g.meanings[0]?.definition?.text||"",example:"",source:"VanDale",goedIndex:index})),
 {word:"aandacht",article:"de",pos:"noun",translation:"attention",definition:"Het richten van je gedachten op iemand of iets.",example:"Ze luistert met aandacht naar het verhaal.",source:"Everyday Dutch"},
 {word:"afspreken",article:"",pos:"verb",translation:"to arrange · to agree",definition:"Samen bepalen wat je gaat doen, waar en wanneer.",example:"We spreken af om morgen samen te fietsen.",source:"Everyday Dutch"},
 {word:"bijzonder",article:"",pos:"adjective",translation:"special · unusual",definition:"Anders dan gewoon; iets wat opvalt.",example:"Het was een bijzondere dag.",source:"Core vocabulary"},
 {word:"gezellig",article:"",pos:"adjective",translation:"cosy · pleasant",definition:"Met een prettige, ontspannen sfeer.",example:"We hadden een gezellige avond met vrienden.",source:"Everyday Dutch"},
 {word:"onderweg",article:"",pos:"adverb",translation:"on the way",definition:"Tijdens de reis naar een bestemming.",example:"Ik ben onderweg naar huis.",source:"Everyday Dutch"},
 {word:"ontmoeten",article:"",pos:"verb",translation:"to meet",definition:"Iemand zien en met die persoon in contact komen.",example:"Morgen ontmoet ik mijn nieuwe collega.",source:"Core vocabulary"},
 {word:"rustig",article:"",pos:"adjective",translation:"quiet · calm",definition:"Zonder drukte, lawaai of haast.",example:"Het is hier rustig in de ochtend.",source:"Everyday Dutch"},
 {word:"wandelen",article:"",pos:"verb",translation:"to walk",definition:"Lopen voor je plezier.",example:"We wandelen graag door het bos.",source:"Core vocabulary"},
 {word:"weer",article:"het",pos:"noun",translation:"weather",definition:"De toestand van de lucht buiten, zoals regen, wind en zon.",example:"Vandaag is het mooi weer.",source:"Core vocabulary"},
 {word:"zin",article:"de",pos:"noun",translation:"sentence",definition:"Een groep woorden die samen iets betekent.",example:"Lees de eerste zin nog een keer.",source:"Core vocabulary"}
];
type Variant="compact"|"reading";
function toModel(w:typeof words[number]):LibrarySenseCardGroupModel{if("detailIndex" in w)return detailGroups[w.detailIndex as number];if("goedIndex" in w)return goedGroups[w.goedIndex as number];const meaning={entryId:w.word,cardTypeId:"word-to-definition" as const,displayOrdinal:1,partOfSpeech:w.pos,definition:{contentNodeId:w.word+"-d",parentContentNodeId:null,kind:"definition" as const,text:w.definition,children:[]},entryTranslation:demoWordTranslations[w.word]||w.translation,entryTranslationAlternatives:[],translationStatus:null,details:[{contentNodeId:w.word+"-e",parentContentNodeId:null,kind:"example" as const,text:w.example,children:[]}],schedulerPhase:null,reviewCapabilities:[],repeatCount:0,startLearning:null,markKnown:null,undoKnown:null,reportCapability:null};return {article:w.article,headword:w.word,partOfSpeech:w.pos,coreVocabularyLabel:null,audioCapability:null,senseCount:1,meanings:[meaning],crossReferences:[],presentations:[{kind:"sense-card",meaning}]};}
export function LibraryPrototype(){
 const locale=useContext(InterfaceLanguageContext);const copy=getUiMessages(locale).library;
 const toolbarRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const toolbar=toolbarRef.current;if(!toolbar)return;
  const measure=()=>toolbar.parentElement?.style.setProperty("--library-toolbar-height",`${toolbar.offsetHeight}px`);
  measure();const observer=new ResizeObserver(measure);observer.observe(toolbar);
  return ()=>observer.disconnect();
 },[]);
 const [expandAll,setExpandAll]=useState({expanded:false,revision:0});
 const [variant,setVariant]=useState<Variant>("compact");const [study,setStudy]=useState<LibraryStudy>(studyDefaults);
 const [query,setQuery]=useState("goed");const [filter,setFilter]=useState(defaultLibraryFilter);const [filters,setFilters]=useState(false);const [selected,setSelected]=useState<string|null>("goed-noun");
 useEffect(()=>{if(window.matchMedia("(max-width:700px)").matches)setSelected(null);const p=new URLSearchParams(location.search);if(p.get("layout")==="reading")setVariant("reading");setStudy(readStudy(p));},[]);
 function choose(v:Variant){setVariant(v);const u=new URL(location.href);u.searchParams.set("layout",v);history.replaceState(null,"",u);}
 function updateStudy(next:LibraryStudy){setStudy(next);studyUrl(next);}
 const searched=words.filter(w=>`${w.word} ${w.translation}`.toLowerCase().includes(query.toLowerCase()));
 const results=searched.filter(w=>matchesLibraryFilter(w,filter));const word=results.find(w=>`${w.word}-${w.pos}`===selected);
 return <DemoCollectionsProvider><section className={s.library} data-density={variant} data-listing={study.listing} data-count-position={study.countPosition} aria-label={copy.title} lang={locale}><h1 className={s.srOnly}>{copy.title}</h1>
 <div ref={toolbarRef} className={s.searchToolbar}><div className={s.searchRow}><label className={s.search}><Search size={18}/><input aria-label={copy.search} placeholder={copy.searchPlaceholder} value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label={copy.clearSearch} onClick={()=>setQuery("")}><X size={16}/></button>}</label><button className={`${s.filterButton} ${filters?s.active:""}`} aria-label={copy.filters} aria-haspopup="dialog" aria-expanded={filters} data-filtered={filter.source!=="All sources"||filter.parts.length>0||filter.language!=="Dutch"||undefined} onClick={()=>setFilters(!filters)}><SlidersHorizontal size={17}/></button></div>

 <div className={s.scope}><span>{libraryFilterSummary(filter,locale)}</span><span>{formatUiCount(locale,results.length,copy,"entry")}</span></div></div>
 <div className={`${s.workspace} ${word?s.hasDetail:""}`}><LibraryResultList language={locale} density={variant} listing={study.listing} countPosition={study.countPosition} hasDetail={Boolean(word)}>{results.map(w=>{const m=toModel(w);return <LibraryResultRow key={`${w.word}-${w.pos}`} headword={w.word} article={w.article} parts={[w.pos]} core={m.coreVocabularyLabel} source={w.source} meaningCount={m.senseCount} contentLanguage="nl" language={locale} selected={selected===`${w.word}-${w.pos}`} preview={w.definition} onSelect={()=>{const id=`${w.word}-${w.pos}`;setExpandAll(v=>({expanded:false,revision:v.revision+1}));setSelected(id);}} onExpandAll={()=>{if(window.matchMedia("(min-width:701px)").matches)setExpandAll(v=>({expanded:true,revision:v.revision+1}));}}/>})}{!results.length&&<div className={s.empty}><h2>{copy.noWords}</h2><LibraryButton onClick={()=>{setQuery("");setFilter(defaultLibraryFilter);}}>{copy.clearFilters}</LibraryButton></div>}</LibraryResultList>
 {word&&<LibraryArticle key={`${word.word}-${word.pos}`} expandAll={expandAll} model={toModel(word)} source={word.source} study={study} onClose={()=>setSelected(null)}/>}
 </div>
 {filters&&<LibraryFilters layout={study.filterLayout} value={filter} sources={Array.from(new Set(words.map(w=>w.source)))} count={next=>searched.filter(w=>matchesLibraryFilter(w,next)).length} onClose={()=>setFilters(false)} onApply={next=>{setFilter(next);setFilters(false);}}/>}
 <LibraryStudyPanel study={study} onChange={updateStudy} density={variant} onDensity={choose} onBrowse={()=>{setQuery("");setSelected("goed-noun");}}/>

 </section></DemoCollectionsProvider>;
}
