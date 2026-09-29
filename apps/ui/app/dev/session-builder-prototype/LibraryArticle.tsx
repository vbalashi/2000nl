"use client";
import {WordIdentity} from "@/components/practice/ui/WordIdentity";
import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Languages, Volume2, X, List, Quote, Repeat2 } from "lucide-react";
import type { LibrarySenseCardGroupModel, LibrarySenseCardModel, LibrarySenseContent } from "@/components/training/library-v2/librarySenseCardModel";
import { SenseCardReveal } from "@/components/training/SenseCardChrome";
import { LibraryIconButton, MeaningActions, DemoLearningState } from "./LibraryActions";
import type { LibraryStudy } from "./libraryStudy";
import s from "./library.module.css";
import { LibraryMeaningViewport } from "./LibraryMeaningViewport";
import {LibrarySheetHandle} from "./LibrarySheetHandle";
import {WordForms,SenseRelations} from "./LibraryWordDetails";
export { LibraryButton, LibraryIconButton } from "./LibraryActions";
// POS families from apps/ui/docs/design-guide.md; current V2 headers still hardcode green.
const posDots:Record<string,string>={noun:"var(--practice-info)",zn:"var(--practice-info)",verb:"var(--practice-danger)",ww:"var(--practice-danger)",adjective:"var(--practice-success)",bn:"var(--practice-success)",adverb:"var(--practice-warning)",bw:"var(--practice-warning)",preposition:"var(--practice-accent)",vz:"var(--practice-accent)"};
export function Metadata({ pos, core, source }: { pos: string | null; core?: string | null; source?: string }) {
  return <span className={s.metadata}><span className={s.pos}><i style={{background:posDots[pos||""]||"var(--practice-text-muted)"}}/>{pos}</span>{core && <span className={s.badge}>{core}</span>}{source && <span className={s.source}>{source}</span>}</span>;
}
// The corner marker never reserves a content column.
export function NumberedMeaningFrame({ ordinal, numbering, open, exposure, children }: { exposure?:React.ReactNode; ordinal: number | null; numbering: LibraryStudy["numbering"]; open: boolean; children: React.ReactNode }) {
  return <article className={s.meaningCard} data-numbering={numbering} data-expanded={open} data-exposure={exposure?"frame":"inline"}>{exposure&&<span className={s.frameExposure} aria-hidden="true">{exposure}</span>}{numbering === "corner" && ordinal != null && <span className={s.cornerNumber} aria-hidden="true">{ordinal}</span>}{children}</article>;
}
export function TranslatedText({text,visible,emphasis=false}:{text?:string|null;visible:boolean;emphasis?:boolean}) {
  return text?<SenseCardReveal open={visible}><p lang="en" className={emphasis?s.translationEmphasis:s.translation}>{text}</p></SenseCardReveal>:null;
}
export function LibraryContentNode({ node,translationVisible=false }: { node: LibrarySenseContent;translationVisible?:boolean }) {
  return <div className={s.contentNode} data-kind={node.kind}><div className={s.contentPair}><span className={s.nodeRole} data-role={node.kind === "example" ? "example" : "explanation"}>{node.kind === "example" ? "Example" : node.kind === "idiom-explanation" || node.kind === "definition" ? "Explanation" : "Note"}</span><p className={node.kind === "example" || node.kind === "idiom" ? s.literary : s.explanation}>{node.text}</p><TranslatedText text={node.translation} visible={translationVisible}/></div>{node.children.length > 0 && <div className={s.children}>{node.children.map(child => <LibraryContentNode key={child.contentNodeId} node={child} translationVisible={translationVisible}/>)}</div>}</div>;
}
export function MeaningContent({ meaning,translationVisible=false }: { meaning: LibrarySenseCardModel;translationVisible?:boolean }) {
  const groups = [{ label: "Examples", nodes: meaning.details.filter(n => n.kind === "example") }, { label: "Expressions & usage", nodes: meaning.details.filter(n => n.kind !== "example") }];
  return <>{meaning.definition?.children.map(n => <LibraryContentNode key={n.contentNodeId} node={n} translationVisible={translationVisible}/>)}{groups.filter(g => g.nodes.length).map(group => <section className={s.contentSection} key={group.label}><h3>{group.label==="Examples"?<List size={12}/>:<Quote size={12}/>}<span>{group.label}</span></h3>{group.nodes.map(n => <LibraryContentNode key={n.contentNodeId} node={n} translationVisible={translationVisible}/>)}</section>)}</>;
}
export function MeaningCard({ readOnly=false, preview=false, meaning, defaultOpen, expandAll, focusMeaning, study, translationVisible, onNotice }: { readOnly?:boolean; preview?:boolean; translationVisible:boolean; meaning: LibrarySenseCardModel; defaultOpen: boolean; focusMeaning?:string; expandAll?:{expanded:boolean;revision:number}; study: LibraryStudy; onNotice: (s: string) => void }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(()=>{if(expandAll)setOpen(expandAll.expanded);},[expandAll]);
  useEffect(()=>{if(focusMeaning)setOpen(focusMeaning===meaning.entryId);},[focusMeaning,meaning.entryId]);
  const [state, setState] = useState<DemoLearningState>("new");
  const exposureCount=study.scene==="review"?(meaning.repeatCount||3):0;
  const exposureLabel=exposureCount?`${exposureCount}×`:"New";
  const exposure=<><Repeat2 size={11}/><span>{exposureLabel}</span></>;
  const status = state === "known" ? "Known" : state === "excluded" ? "Excluded" : study.scene === "review" ? "Review" : state === "learning" ? "Learning" : "New";
  return <NumberedMeaningFrame ordinal={meaning.displayOrdinal} numbering={study.numbering} open={open} exposure={study.exposure==="frame"?exposure:undefined}>
    <button className={s.meaningLead} aria-label={`${meaning.displayOrdinal ?? ""} ${meaning.definition?.text || "Expression"} · ${exposureLabel}${state === "new" ? "" : ` · ${status}`}`} aria-expanded={open} onClick={() => setOpen(!open)}>{study.numbering === "inline" && <span className={s.ordinal}>{meaning.displayOrdinal}</span>}<span className={s.meaningText}><TranslatedText emphasis text={[meaning.entryTranslation,...meaning.entryTranslationAlternatives].filter(Boolean).join(" · ")} visible={translationVisible}/><span className={s.definitionText}>{meaning.definition?.text || "Expression"}</span><TranslatedText text={meaning.definition?.translation} visible={translationVisible}/></span>{study.exposure==="inline"&&<span className={s.inlineExposure}>{exposure}</span>}<ChevronDown size={14} className={open ? s.rotated : ""}/></button>
    <SenseCardReveal open={open}><div className={s.meaningBody} inert={!open} aria-hidden={!open}><SenseRelations entryId={meaning.entryId} compact={study.wordDetails==="complete"}/><MeaningContent meaning={meaning} translationVisible={translationVisible}/>{!preview&&!readOnly&&<MeaningActions cardId={meaning.entryId} study={study} state={state} onState={setState} onNotice={onNotice}/>}</div></SenseCardReveal>
  </NumberedMeaningFrame>;
}
export function LibraryArticleHeader({ preview=false, model, source, study, translationVisible, onToggleTranslation, onClose, onNotice, forms }: { forms?:React.ReactNode; preview?:boolean; translationVisible:boolean;onToggleTranslation:()=>void;model: LibrarySenseCardGroupModel; source: string; study: LibraryStudy; onClose: () => void; onNotice: (s: string) => void }) {
  return <header className={s.articleHeader}><div className={s.articleMeta}><Metadata pos={model.partOfSpeech} core={model.coreVocabularyLabel} source={source}/>{!preview&&<div className={s.headerActions}><LibraryIconButton className={s.languageControl} data-header-shape={study.headerShape} label={translationVisible?"Hide translations":"Show translations"} aria-pressed={translationVisible} onClick={onToggleTranslation}><Languages size={16}/></LibraryIconButton><LibraryIconButton className={s.languageControl} data-header-shape={study.headerShape} label="Play audio" onClick={() => onNotice("Audio preview · no request sent")}><Volume2 size={16}/></LibraryIconButton><LibraryIconButton className={s.desktopClose} label="Close word details" onClick={onClose}><X size={16}/></LibraryIconButton></div>}</div><div className={s.wordIdentity}><div className={s.headwordRow}><h2><WordIdentity article={model.article} headword={model.headword}/></h2></div>{forms}</div></header>;
}
export function LibraryArticle({ model, source, study, onClose, preview=false, expandAll, focusMeaning, embedded=false, readOnly=false }: { focusMeaning?:string; embedded?:boolean; readOnly?:boolean; expandAll?:{expanded:boolean;revision:number}; preview?:boolean; model: LibrarySenseCardGroupModel; source: string; study: LibraryStudy; onClose: () => void }) {
  const [notice, setNotice] = useState("");
  const [formsOpen,setFormsOpen]=useState(false);const formsId=useId();
  const meaningsRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!focusMeaning)return;
    const node=meaningsRef.current;
    const index=model.meanings.findIndex(m=>m.entryId===focusMeaning);
    const target=node?.querySelectorAll<HTMLElement>("[data-numbering]")[index];
    if(!node||!target)return;
    const align=()=>node.scrollTo({top:node.scrollTop+target.getBoundingClientRect().top-node.getBoundingClientRect().top-24,behavior:"instant"});
    align();
    const observer=new ResizeObserver(align);observer.observe(target);
    const timer=setTimeout(()=>observer.disconnect(),350);
    return()=>{clearTimeout(timer);observer.disconnect();};
  },[focusMeaning,model]);
  const formsProps={model,variant:study.wordDetails,open:formsOpen,onToggle:()=>{setFormsOpen(v=>!v);meaningsRef.current?.scrollTo({top:0,behavior:"instant"});},id:formsId};
  const [translationVisible,setTranslationVisible]=useState(preview);
  const [expanded,setExpanded]=useState(false);
  const [dragOffset,setDragOffset]=useState(0);
  const [closing,setClosing]=useState(false);
  const closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(closeTimer.current)clearTimeout(closeTimer.current);},[]);
  const close=()=>{if(closing)return;if(embedded||window.matchMedia("(prefers-reduced-motion: reduce)").matches){onClose();return;}setClosing(true);closeTimer.current=setTimeout(onClose,180);};
  const collapse=()=>{setExpanded(false);meaningsRef.current?.scrollTo({top:0,behavior:"instant"});};
  return <article data-presentation={embedded?"panel":undefined} data-closing={closing||undefined} style={{"--sheet-drag":`${dragOffset}px`} as React.CSSProperties} data-dragging={dragOffset!==0||undefined} data-sheet={preview||embedded?undefined:expanded?"full":"peek"} data-marker-placement={study.markerPlacement||"above"} data-article-frame={study.articleFrame} data-preview={preview||undefined} className={s.detail} data-nested-text-inset={study.nestedTextInset} data-example-line={study.roleLabels === "plain" ? "none" : "visible"} data-role-labels={study.roleLabels === "plain" ? "border" : study.roleLabels} data-nested-reading={study.nestedReading} data-translation-ink={study.translationInk} data-nesting={study.nesting} data-controls={study.controls} data-shape={study.shape} aria-label="Word details">{!preview&&!embedded&&<LibrarySheetHandle onDrag={setDragOffset} expanded={expanded} onExpand={()=>setExpanded(true)} onCollapse={collapse} onClose={close}/>}<LibraryArticleHeader preview={preview} model={model} source={source} study={study} translationVisible={translationVisible} onToggleTranslation={()=>setTranslationVisible(v=>!v)} onClose={close} onNotice={setNotice} forms={!preview&&<WordForms {...formsProps} part="summary"/>}/><LibraryMeaningViewport scrollRef={meaningsRef} preview={preview}>{!preview&&<WordForms {...formsProps} part="body"/>}{model.meanings.map((m) => <MeaningCard readOnly={readOnly} preview={preview} key={m.entryId} meaning={m} defaultOpen={preview} expandAll={expandAll} focusMeaning={focusMeaning} study={study} translationVisible={translationVisible} onNotice={setNotice}/>)}</LibraryMeaningViewport>{notice && <p className={s.notice} role="status">{notice}</p>}</article>;
}
