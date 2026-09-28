"use client";
import React, { useState } from "react";
import { ChevronDown, Languages, Volume2, X, ArrowLeft, List, Quote, Repeat2 } from "lucide-react";
import type { LibrarySenseCardGroupModel, LibrarySenseCardModel, LibrarySenseContent } from "@/components/training/library-v2/librarySenseCardModel";
import { SenseCardReveal } from "@/components/training/SenseCardChrome";
import { LibraryIconButton, MeaningActions, DemoLearningState } from "./LibraryActions";
import type { LibraryStudy } from "./libraryStudy";
import s from "./library.module.css";
export { LibraryButton, LibraryIconButton } from "./LibraryActions";
// POS families from apps/ui/docs/design-guide.md; current V2 headers still hardcode green.
const posDots:Record<string,string>={noun:"#6493ce",zn:"#6493ce",verb:"#cf747c",ww:"#cf747c",adjective:"#64a681",bn:"#64a681",adverb:"#d49b60",bw:"#d49b60",preposition:"#a283c5",vz:"#a283c5"};
export function Metadata({ pos, core, source }: { pos: string | null; core?: string | null; source?: string }) {
  return <span className={s.metadata}><span className={s.pos}><i style={{background:posDots[pos||""]||"#94a3b8"}}/>{pos}</span>{core && <span className={s.badge}>{core}</span>}{source && <span className={s.source}>{source}</span>}</span>;
}
// The corner marker never reserves a content column.
export function NumberedMeaningFrame({ ordinal, numbering, open, exposure, children }: { exposure?:React.ReactNode; ordinal: number | null; numbering: LibraryStudy["numbering"]; open: boolean; children: React.ReactNode }) {
  return <article className={s.meaningCard} data-numbering={numbering} data-expanded={open} data-exposure={exposure?"frame":"inline"}>{exposure&&<span className={s.frameExposure} aria-hidden="true">{exposure}</span>}{numbering === "corner" && ordinal != null && <span className={s.cornerNumber} aria-hidden="true">{ordinal}</span>}{children}</article>;
}
export function TranslatedText({text,visible,emphasis=false}:{text?:string|null;visible:boolean;emphasis?:boolean}) {
  return text?<SenseCardReveal open={visible}><p lang="en" className={emphasis?s.translationEmphasis:s.translation}>{text}</p></SenseCardReveal>:null;
}
export function LibraryContentNode({ node,translationVisible=false }: { node: LibrarySenseContent;translationVisible?:boolean }) {
  return <div className={s.contentNode} data-kind={node.kind}><div className={s.contentPair}><span className={s.nodeRole}>{node.kind === "example" ? "Example" : node.kind === "idiom-explanation" || node.kind === "definition" ? "Explanation" : "Note"}</span><p className={node.kind === "example" || node.kind === "idiom" ? s.literary : s.explanation}>{node.text}</p><TranslatedText text={node.translation} visible={translationVisible}/></div>{node.children.length > 0 && <div className={s.children}>{node.children.map(child => <LibraryContentNode key={child.contentNodeId} node={child} translationVisible={translationVisible}/>)}</div>}</div>;
}
export function MeaningContent({ meaning,translationVisible=false }: { meaning: LibrarySenseCardModel;translationVisible?:boolean }) {
  const groups = [{ label: "Examples", nodes: meaning.details.filter(n => n.kind === "example") }, { label: "Expressions & usage", nodes: meaning.details.filter(n => n.kind !== "example") }];
  return <>{meaning.definition?.children.map(n => <LibraryContentNode key={n.contentNodeId} node={n} translationVisible={translationVisible}/>)}{groups.filter(g => g.nodes.length).map(group => <section className={s.contentSection} key={group.label}><h3>{group.label==="Examples"?<List size={12}/>:<Quote size={12}/>}<span>{group.label}</span></h3>{group.nodes.map(n => <LibraryContentNode key={n.contentNodeId} node={n} translationVisible={translationVisible}/>)}</section>)}</>;
}
export function MeaningCard({ meaning, defaultOpen, study, translationVisible, onNotice }: { translationVisible:boolean; meaning: LibrarySenseCardModel; defaultOpen: boolean; study: LibraryStudy; onNotice: (s: string) => void }) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, setState] = useState<DemoLearningState>("new");
  const exposureCount=study.scene==="review"?(meaning.repeatCount||3):0;
  const exposureLabel=exposureCount?`${exposureCount}×`:"New";
  const exposure=<><Repeat2 size={11}/><span>{exposureLabel}</span></>;
  const status = state === "known" ? "Known" : state === "excluded" ? "Excluded" : study.scene === "review" ? "Review" : state === "learning" ? "Learning" : "New";
  return <NumberedMeaningFrame ordinal={meaning.displayOrdinal} numbering={study.numbering} open={open} exposure={study.exposure==="frame"?exposure:undefined}>
    <button className={s.meaningLead} aria-label={`${meaning.displayOrdinal ?? ""} ${meaning.definition?.text || "Expression"} · ${exposureLabel}${state === "new" ? "" : ` · ${status}`}`} aria-expanded={open} onClick={() => setOpen(!open)}>{study.numbering === "inline" && <span className={s.ordinal}>{meaning.displayOrdinal}</span>}<span className={s.meaningText}><TranslatedText emphasis text={[meaning.entryTranslation,...meaning.entryTranslationAlternatives].filter(Boolean).join(" · ")} visible={translationVisible}/><span>{meaning.definition?.text || "Expression"}</span><TranslatedText text={meaning.definition?.translation} visible={translationVisible}/></span>{study.exposure==="inline"&&<span className={s.inlineExposure}>{exposure}</span>}<ChevronDown size={14} className={open ? s.rotated : ""}/></button>
    <SenseCardReveal open={open}><div className={s.meaningBody} inert={!open} aria-hidden={!open}><MeaningContent meaning={meaning} translationVisible={translationVisible}/><MeaningActions cardId={meaning.entryId} study={study} state={state} onState={setState} onNotice={onNotice}/></div></SenseCardReveal>
  </NumberedMeaningFrame>;
}
export function LibraryArticleHeader({ model, source, study, translationVisible, onToggleTranslation, onClose, onNotice }: { translationVisible:boolean;onToggleTranslation:()=>void;model: LibrarySenseCardGroupModel; source: string; study: LibraryStudy; onClose: () => void; onNotice: (s: string) => void }) {
  const exit = <LibraryIconButton className={s.returnButton} label={study.navigation === "back" ? "Back to results" : "Close word details"} onClick={onClose}>{study.navigation === "back" ? <ArrowLeft size={17}/> : <X size={16}/>}</LibraryIconButton>;
  return <header className={s.articleHeader}><div className={s.articleMeta}>{study.navigation === "back" && exit}<Metadata pos={model.partOfSpeech} core={model.coreVocabularyLabel} source={source}/><div className={s.headerActions}><LibraryIconButton className={s.languageControl} data-header-shape={study.headerShape} label={translationVisible?"Hide translations":"Show translations"} aria-pressed={translationVisible} onClick={onToggleTranslation}><Languages size={16}/></LibraryIconButton><LibraryIconButton className={s.languageControl} data-header-shape={study.headerShape} label="Play audio" onClick={() => onNotice("Audio preview · no request sent")}><Volume2 size={16}/></LibraryIconButton>{study.navigation === "close" && exit}</div></div><div className={s.headwordRow}><h2>{model.article && <span>{model.article} </span>}{model.headword}</h2></div></header>;
}
export function LibraryArticle({ model, source, study, onClose }: { model: LibrarySenseCardGroupModel; source: string; study: LibraryStudy; onClose: () => void }) {
  const [notice, setNotice] = useState("");
  const [translationVisible,setTranslationVisible]=useState(false);
  return <article className={s.detail} data-nested-text-inset={study.nestedTextInset} data-role-labels={study.roleLabels} data-nested-reading={study.nestedReading} data-translation-ink={study.translationInk} data-nesting={study.nesting} data-controls={study.controls} data-shape={study.shape} aria-label="Word details"><LibraryArticleHeader model={model} source={source} study={study} translationVisible={translationVisible} onToggleTranslation={()=>setTranslationVisible(v=>!v)} onClose={onClose} onNotice={setNotice}/><div className={s.meaningScroll} tabIndex={0} aria-label="Meanings">{model.meanings.map((m, i) => <MeaningCard key={m.entryId} meaning={m} defaultOpen={i === 0} study={study} translationVisible={translationVisible} onNotice={setNotice}/>)}</div>{notice && <p className={s.notice} role="status">{notice}</p>}</article>;
}
