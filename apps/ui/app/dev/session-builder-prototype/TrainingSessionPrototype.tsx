"use client";
import React, {useEffect,useRef,useState} from "react";
import {Check,History,Languages,MoreHorizontal,SlidersHorizontal,Volume2,X} from "lucide-react";
import {usePromptReveal} from "@/components/practice/ui/usePromptReveal";
import {LibraryMeaningViewport} from "./LibraryMeaningViewport";
import {WordIdentity} from "@/components/practice/ui/WordIdentity";
import {RatingControls} from "@/components/practice/RatingControls";
import {SessionCardActions,type CardMark} from "./SessionCardActions";
import {SessionVariations,sessionStyleDefaults} from "./SessionVariations";
import {IconAction} from "@/components/practice/ui/IconAction";
import {PracticePanel} from "@/components/practice/ui/PracticePanel";
import {LibraryArticle,MeaningContent,Metadata,TranslatedText} from "./LibraryArticle";
import {studyDefaults} from "./libraryStudy";
import {previewExercise,type PreviewAction,type PreviewRating,type PreviewRun} from "./sessionPreviewModel";
import lib from "./library.module.css";
import s from "./trainingSession.module.css";

type Props={run:PreviewRun;active:boolean;onClose:()=>void;onHistory:()=>void;onAction:(action:PreviewAction)=>void;onProgress:(completed:number)=>void};
export function TrainingSessionPrototype({run,active,onClose,onHistory,onAction,onProgress}:Props){
 const [style,setStyle]=useState(sessionStyleDefaults);
 const [variations,setVariations]=useState(false);
 const [completed,setCompleted]=useState(0);
 const [revealed,setRevealed]=useState(false);
 const [translation,setTranslation]=useState(false);
 const [typed,setTyped]=useState("");
 const [details,setDetails]=useState(false);
 const [detailsReady,setDetailsReady]=useState(false);
 const [marks,setMarks]=useState<Record<string,CardMark>>({});
 const [notice,setNotice]=useState("");
 const heading=useRef<HTMLHeadingElement>(null);
 const content=useRef<HTMLDivElement>(null);
 const ratingLock=useRef(false);
 const done=completed>=run.draft.size;
 const card=previewExercise(run,completed);
 const meaning=card.meaning;
 const markKey=`${meaning.entryId}:${card.kind.split(" · ")[0]}`;
 const mark=marks[markKey];
 const words=card.kind.startsWith("Words");
 const {capture,moving}=usePromptReveal(heading,revealed);
 const reverseWord=words&&!card.headwordPrompt;
 const question=<h1 ref={heading} tabIndex={-1} className={words?(card.headwordPrompt?s.headword:s.definition):s.sentence} lang={card.kind.startsWith("Translation")?"en":"nl"}>{words&&card.headwordPrompt?<WordIdentity article={card.model.article} headword={card.model.headword}/>:card.prompt}</h1>;
 useEffect(()=>{ratingLock.current=false;if(active)heading.current?.focus({preventScroll:true});},[active,completed]);
 function advance(result:PreviewAction["result"]){
  if(moving||done||ratingLock.current)return;
  ratingLock.current=true;
  onAction({id:crypto.randomUUID(),word:[card.model.article,card.model.headword].filter(Boolean).join(" "),exercise:card.kind,result,at:new Date().toISOString()});
  const next=completed+1;setCompleted(next);onProgress(next);setRevealed(false);setTyped("");setNotice("");content.current?.scrollTo({top:0});
 }
 function rate(result:PreviewRating){if(revealed&&!mark)advance(result);}
 function changeMark(next:CardMark|undefined){
  ratingLock.current=false;
  setMarks(current=>{const updated={...current};if(next)updated[markKey]=next;else delete updated[markKey];return updated;});
 }
 function reveal(){capture();ratingLock.current=false;setRevealed(true);heading.current?.focus({preventScroll:true});}
 return <section hidden={!active} className={s.session} style={{"--session-control-height":`${style.height==="adaptive"?46:style.height}px`,"--practice-font-definition":style.definition==="reading"?"var(--practice-font-reading)":"var(--practice-font-ui)","--practice-definition-size":style.definition==="reading"?"var(--practice-reading-definition, var(--practice-text-title-sm))":"var(--practice-reading-body)"} as React.CSSProperties} aria-label="Training session">
  <header className={s.chrome}><div className={s.sessionTitle}><span>{run.name}</span><small>{done?"Complete":card.kind}</small></div><span className={s.count} aria-label={`${completed} of ${run.draft.size} completed`}>{completed}<span> / {run.draft.size}</span></span><IconAction className={s.utility} label="Recent activity" onClick={onHistory}><History size={19}/></IconAction><IconAction className={s.utility} label="Close session" onClick={onClose}><X size={20}/></IconAction>
  <div className={s.progress} role="progressbar" aria-label="Completed exercises" aria-valuemin={0} aria-valuemax={run.draft.size} aria-valuenow={completed}><span style={{width:`${completed/run.draft.size*100}%`}}/></div></header>
  {done?<div className={s.finished}><Check size={30}/><h1 ref={heading} tabIndex={-1}>Session complete</h1><p><strong>{completed}</strong> exercises completed</p><button className={s.primary} onClick={onClose}><span>Back to training</span></button><button className={s.textButton} onClick={onHistory}>Recent activity</button></div>:<>
   <div className={`${s.card} ${lib.library} ${lib.detail}`} data-nesting={studyDefaults.nesting} data-role-labels="border" data-example-line="none" data-nested-reading={studyDefaults.nestedReading} data-nested-text-inset={studyDefaults.nestedTextInset}>
    <div className={s.cardTools}><Metadata pos={card.model.partOfSpeech} core={card.model.coreVocabularyLabel}/><div><IconAction className={s.round} label="Play audio" onClick={()=>setNotice("Audio is not connected in this preview.")}><Volume2 size={17}/></IconAction><IconAction className={s.round} label={translation?"Hide translations":"Show translations"} aria-pressed={translation} onClick={()=>setTranslation(v=>!v)}><Languages size={17}/></IconAction><IconAction className={s.round} label="Open word details" aria-haspopup="dialog" onClick={()=>{setDetailsReady(false);setDetails(true);}}><MoreHorizontal size={19}/></IconAction></div></div>
    <div className={s.prompt} data-revealed={revealed} data-moving={moving}>
     {reverseWord&&revealed?<div className={s.revealedIdentity} data-ready={!moving}><p className={s.headword}><WordIdentity article={card.model.article} headword={card.model.headword}/></p><TranslatedText visible={translation} text={meaning.entryTranslation} emphasis/></div>:question}
     {revealed&&words&&!reverseWord&&<div className={s.promptTranslation} data-ready={!moving}><TranslatedText visible={translation} text={meaning.entryTranslation} emphasis/></div>}
    </div>
    {revealed&&<div className={s.answerViewport} data-ready={!moving} data-reverse={reverseWord} data-moving-question={reverseWord&&moving} aria-busy={moving} inert={moving}>
     <LibraryMeaningViewport scrollRef={content} preview={false} label="Answer details">
      <div className={s.answer}>
       <div className={s.answerPair}>{reverseWord?question:<p className={s.definition} lang="nl">{card.answer}</p>}
       {words&&<TranslatedText visible={translation&&!moving} text={meaning.definition?.translation}/>}</div>
       {words&&<MeaningContent meaning={meaning} translationVisible={translation}/>}
      </div>
     </LibraryMeaningViewport>
    </div>}

   </div>
   <footer className={s.answerControls}>
    {mark?<div className={s.markedCard}><div><span role="status">{mark==="known"?"Marked as known":"Excluded from training"}</span><button className={s.textButton} onClick={()=>changeMark(undefined)}>Undo</button></div><button className={s.primary} onClick={()=>advance(mark==="known"?"Known":"Excluded")}><span>Next card</span></button></div>:!revealed?<><label className={s.typed} hidden={run.draft.mode!=="Type the answer"}><span>Your answer</span><input aria-label="Your answer" autoComplete="off" value={typed} onChange={event=>setTyped(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();reveal();}}}/></label><button className={s.primary} onClick={reveal}><span>{run.draft.mode==="Type the answer"?"Compare answer":"Show answer"}</span></button></>:<>{typed&&<p className={s.typedResult}>Your answer: {typed}</p>}<RatingControls language={style.language} ink={style.ink} marker={style.marker} layout={style.layout} height={style.height} disabled={moving} onRate={rate}/></>}
    <SessionCardActions key={`${completed}:${active}`} disabled={moving||!active} onMark={changeMark} onNotice={setNotice}/>
    <div className={s.previewTools}><p className={s.caption} role="status">{notice||"Preview · Dutch samples"}</p><button className={s.variationButton} onClick={()=>setVariations(true)}><SlidersHorizontal size={13}/>Variations</button></div>
   </footer>
  </>}
  {active&&details&&<PracticePanel title="Word details" headless onEntered={()=>setDetailsReady(true)} onClose={()=>setDetails(false)}>{dismiss=><div className={`${lib.library} ${s.articleHost}`}><LibraryArticle embedded readOnly model={card.model} source="VanDale" study={studyDefaults} focusMeaning={detailsReady?meaning.entryId:undefined} onClose={dismiss}/></div>}</PracticePanel>}
  {variations&&<SessionVariations value={style} onChange={setStyle} onClose={()=>setVariations(false)}/>}
 </section>;
}
