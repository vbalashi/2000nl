"use client";
import React, { useCallback, useContext, useRef, useState } from "react";
import { List, EyeOff, Flag, MoreHorizontal, ChevronDown } from "lucide-react";
import { TrainingCardReviewButton } from "@/components/training/v2/TrainingCardTemplates";
import {IconAction} from "@/components/practice/ui/IconAction";
import type { LibraryStudy } from "./libraryStudy";
import {getUiMessages,formatUiMessage} from "@/lib/uiMessages";
import {getTrainingRatingLabels} from "@/components/training/trainingHotkeys";
import {InterfaceLanguageContext} from "./VariantControls";
import s from "./library.module.css";
import {CardActionMenu,CollectionPicker,CardReportDialog,useCollections} from "./LibraryOverlays";
export type DemoLearningState = "new" | "learning" | "known" | "excluded";
export function LibraryButton({ children, primary = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button type="button" {...props} className={`${s.button} ${primary ? s.primary : ""} ${props.className || ""}`}>{children}</button>;
}
export function LibraryIconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <IconAction {...props} label={label} title={label} className={`${s.iconButton} ${props.className || ""}`}>{children}</IconAction>;
}
export function MeaningActions({ cardId, study, state, onState, onNotice }: { cardId:string; study: LibraryStudy; state: DemoLearningState; onState: (s: DemoLearningState) => void; onNotice: (s: string) => void }) {
  const locale=useContext(InterfaceLanguageContext);const messages=getUiMessages(locale);const copy=messages.library;const ratings=getTrainingRatingLabels(locale);
  const [panel,setPanel]=useState<"collections"|"report"|null>(null);
  const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null);
  const {catalog,create,memberships,toggle,add}=useCollections();
  const selected=memberships[cardId]||[];
  const [rating,setRating]=useState("");
  const trigger=useRef<HTMLButtonElement|null>(null);
  const closeMenu=useCallback(()=>{setAnchor(null);trigger.current?.focus();},[]);
  function close(){setPanel(null);requestAnimationFrame(()=>trigger.current?.focus());}
  function open(next:"collections"|"report",button:HTMLButtonElement){trigger.current=button;setPanel(next);}
  function more(button:HTMLButtonElement){trigger.current=button;setAnchor(anchor?null:button);}
  function action(next:"report"|"known"|"excluded"){closeMenu();if(next==="report")setPanel("report");else{onState(next);onNotice(formatUiMessage(copy.markNotice,{state:next==="known"?messages.trainingSession.known:messages.article.excluded}));}}
  return <div className={s.actionGroup} data-grouping={study.actions} data-rating-ink={study.ratingInk} data-learn-width={study.learnWidth}>
    <div className={s.actions}>
      {state==="known"||state==="excluded"?<LibraryButton onClick={()=>onState("new")}>{state==="known"?copy.undoKnown:copy.undoExcluded}</LibraryButton>:study.scene==="review"?<div className={s.reviewButtons} aria-label={copy.reviewRatings}>{([["fail","Again"],["hard","Hard"],["success","Good"],["easy","Easy"]] as const).map(([result,label])=><TrainingCardReviewButton key={result} result={result} label={ratings[label]} busy={false} onClick={()=>{setRating(label);onNotice(formatUiMessage(copy.ratingNotice,{rating:ratings[label]}));}}/>)}</div>:<LibraryButton primary onClick={()=>{if(state==="new"){onState("learning");onNotice(copy.learnNotice);}else onNotice(copy.trainNotice);}}>{state==="new"?copy.learn:copy.trainNext}</LibraryButton>}
    </div>
    <div className={s.secondaryActions}>
      <button aria-haspopup="dialog" onClick={e=>open("collections",e.currentTarget)}><List size={14}/>{messages.collections.title} · {new Intl.NumberFormat(locale).format(selected.length)}</button>
      {study.actions==="toolbar"?<button data-action="more" aria-label={copy.moreActions} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={e=>more(e.currentTarget)}><MoreHorizontal size={18}/></button>:<><button className={s.reportAction} aria-label={messages.cardActions.report} title={messages.cardActions.report} onClick={e=>open("report",e.currentTarget)}><Flag size={13}/><span>{messages.cardActions.report}</span></button><button aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={e=>more(e.currentTarget)}><EyeOff size={14}/>{messages.cardActions.exclude}<ChevronDown size={12}/></button></>}
    </div>
    {anchor&&<CardActionMenu anchor={anchor} onClose={closeMenu} onAction={action}/>}
    {panel==="collections"&&<CollectionPicker catalog={catalog} selected={selected} onToggle={id=>toggle(cardId,id)} onCreate={name=>{const id=create(name);add(cardId,id);}} onClose={close}/>}
    {panel==="report"&&<CardReportDialog onClose={close} onNotice={onNotice}/>}
    {rating&&study.scene==="review"&&<small className={s.ratingFeedback} role="status">{formatUiMessage(copy.ratingFeedback,{rating:ratings[rating as keyof typeof ratings]})}</small>}
  </div>;
}
