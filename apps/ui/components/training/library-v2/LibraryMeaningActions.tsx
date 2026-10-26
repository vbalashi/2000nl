"use client";

import React from "react";
import { RatingControls, type Rating } from "@/components/practice/RatingControls";
import { Check, EyeOff, Flag, List, MoreHorizontal, ChartNoAxesColumn, LockKeyhole, Plus, Minus, Archive, Copy, StickyNote } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/practice/ui/ActionMenu";
import { getUiMessages } from "@/lib/uiMessages";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { LibraryMutationCapability, LibrarySenseCardModel } from "./librarySenseCardModel";
import { authorEntryArchiveCopy } from "@/lib/platform/authorEntryArchiveCopy";
import { independentEntryCopyText } from "@/lib/platform/independentEntryCopyText";
import s from "@/components/practice/article/articleActions.module.css";

/** Presentation adapter; authoritative capabilities and callbacks stay with the owner. */
export function LibraryMeaningActions({ meaning, language, busy, collectionCount, currentCollection, onAction, onCollections, onReport, onExclude, onArchive, onCopy, onEditNote, exclusionDisabled, onProgress, onResume, activeTraining = false, headwordTrainingBlocked = false }: {
  activeTraining?: boolean;
  headwordTrainingBlocked?: boolean;
  meaning: LibrarySenseCardModel;
  language: OnboardingLanguage;
  busy: boolean;
  collectionCount: number;
  currentCollection?: { name: string; included: boolean | null; busy: boolean; onToggle: () => void };
  onAction: (capability: LibraryMutationCapability) => void;
  onCollections?: () => void;
  onTrainNext?: () => void;
  onReport?: () => void;
  onExclude?: () => void;
  onArchive?: () => void;
  onCopy?: () => void;
  onEditNote?:()=>void;
  onProgress?: () => void;
  onResume?: () => void;
  exclusionDisabled?: boolean;
}) {
  const [anchor, setAnchor] = React.useState<HTMLButtonElement | null>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const collectionTrigger = React.useRef<HTMLButtonElement>(null);
  const [collectionAnchor, setCollectionAnchor] = React.useState<HTMLButtonElement | null>(null);
  const closeCollections = React.useCallback(() => { setCollectionAnchor(null); collectionTrigger.current?.focus({preventScroll: true}); }, []);
  const close = React.useCallback(() => { setAnchor(null); trigger.current?.focus({preventScroll: true}); }, []);
  const t = (key: string) => platformV2Message(language, key);
  const labels = getUiMessages(language).library;
  const protectionCopy = getUiMessages(language).activeTrainingCard;
  const resumeBlocked = activeTraining || (headwordTrainingBlocked && Boolean(meaning.meaningProgress?.exclusionId));
  const primary = meaning.undoKnown ?? meaning.startLearning;
  const blocked = Boolean(meaning.meaningProgress?.exclusionId || meaning.meaningProgress?.directions.some(d=>d.knownMarkId) || meaning.undoKnown);
  const items: ActionMenuItem[] = [];
  if(onProgress)items.push({id:"progress",label:getUiMessages(language).learningProgress.title,icon:<ChartNoAxesColumn size={15} aria-hidden="true"/>,onSelect:()=>{close();onProgress();}});
  if (onExclude) items.push({id:"exclude",label:getUiMessages(language).trainingSession.exclusion.headwordLabel,description:activeTraining ? protectionCopy.actionHint : headwordTrainingBlocked ? protectionCopy.headwordHint : getUiMessages(language).trainingSession.exclusion.headwordHelp,icon:<EyeOff size={15} aria-hidden="true"/>,disabled:busy || exclusionDisabled || activeTraining || headwordTrainingBlocked,
    onSelect:()=>{if(activeTraining || headwordTrainingBlocked)return;close();onExclude();}});
  if (meaning.markKnown) items.push({id:"known",label:t(meaning.markKnown.messageKey),description:activeTraining ? protectionCopy.actionHint : getUiMessages(language).cardActions.knownHelp,icon:<Check size={15} aria-hidden="true"/>,disabled:busy || activeTraining,
    onSelect:()=>{if(activeTraining)return;close();onAction(meaning.markKnown!);}});
  if (onReport) items.push({id:"report",label:t("senseCard.report"),icon:<Flag size={15} aria-hidden="true"/>,disabled:busy,
    onSelect:()=>{close();onReport();}});
  if(onEditNote)items.push({id:'own-note',label:language==='ru'?'Личная заметка':language==='nl'?'Mijn notitie':'My note',icon:<StickyNote size={15} aria-hidden="true"/>,disabled:busy,onSelect:()=>{close();onEditNote();}});
  if (onCopy) items.push({id:"copy",label:independentEntryCopyText(language).action,icon:<Copy size={15} aria-hidden="true"/>,disabled:busy,onSelect:()=>{close();onCopy();}});
  if (onArchive && meaning.canArchive) items.push({id:"archive",label:authorEntryArchiveCopy(language).action,icon:<Archive size={15} aria-hidden="true"/>,disabled:busy,onSelect:()=>{close();onArchive();}});
  const collectionItems: ActionMenuItem[] = [];
  if (currentCollection && currentCollection.included !== null) collectionItems.push({
    id: "current-collection",
    label: platformV2Message(language, currentCollection.included ? "senseCard.collections.removeCurrent" : "senseCard.collections.addCurrent", { name: currentCollection.name }),
    icon: currentCollection.included ? <Minus size={15} aria-hidden="true"/> : <Plus size={15} aria-hidden="true"/>,
    disabled: busy || currentCollection.busy,
    onSelect: () => { if (busy || currentCollection.busy) return; closeCollections(); currentCollection.onToggle(); },
  });
  if (onCollections) collectionItems.push({ id: "choose-collections", label: t("senseCard.collections.choose"), icon: <List size={15} aria-hidden="true"/>,
    onSelect: () => { closeCollections(); onCollections(); },
  });
  return <div data-testid="library-primary-actions" className={s.group}>
    {activeTraining ? <div className={s.trainingGuard} role="note" data-testid="active-training-card-notice">
      <LockKeyhole size={16} aria-hidden="true"/><div><strong>{protectionCopy.title}</strong><span>{protectionCopy.hint}</span></div>
    </div> : blocked && onResume ? <button type="button" className={s.primary} disabled={busy || resumeBlocked} onClick={()=>{if(!resumeBlocked)onResume();}}>{getUiMessages(language).learningProgress.resume}</button> : primary ? <button type="button" className={s.primary} disabled={busy} onClick={()=>onAction(primary)}>{t(primary.messageKey)}</button>
      : null}
    {!activeTraining && !primary && !blocked ? <LibraryMeaningRatings meaning={meaning} language={language} busy={busy} onAction={onAction}/> : null}
    {!activeTraining && resumeBlocked && blocked ? <p className={s.status}>{protectionCopy.headwordHint}</p> : null}
    <div data-testid="library-service-actions" className={s.row}>
      {onCollections ? <button ref={collectionTrigger} type="button" className={s.quiet}
        aria-haspopup={currentCollection ? "menu" : "dialog"} aria-expanded={currentCollection ? Boolean(collectionAnchor) : undefined}
        onClick={event => currentCollection ? collectionAnchor ? closeCollections() : setCollectionAnchor(event.currentTarget) : onCollections()}>
        <List size={14} aria-hidden="true"/>{t("senseCard.collections.label")}{collectionCount > 0 ? ` · ${new Intl.NumberFormat(language).format(collectionCount)}` : ""}
      </button> : null}
      <span className={s.spacer}/>
      {items.length ? <button ref={trigger} type="button" className={s.quiet} disabled={busy}
        aria-label={labels.moreActions} aria-haspopup="menu" aria-expanded={Boolean(anchor)}
        onClick={event=>anchor?close():setAnchor(event.currentTarget)}><MoreHorizontal size={18} aria-hidden="true"/></button> : null}
    </div>
    {collectionAnchor ? <ActionMenu anchor={collectionAnchor} title={t("senseCard.collections.label")} language={language} items={collectionItems} onClose={closeCollections}/> : null}
    {anchor ? <ActionMenu anchor={anchor} title={getUiMessages(language).cardActions.title} language={language} items={items} onClose={close}/> : null}
  </div>;
}


const reviewRating = { fail: "Again", hard: "Hard", success: "Good", easy: "Easy" } as const;
/** Only authoritative direct capabilities are projected by the Library model. */
export function LibraryMeaningRatings({meaning,language,busy,onAction}:{meaning:LibrarySenseCardModel;language:OnboardingLanguage;busy:boolean;onAction:(capability:LibraryMutationCapability)=>void}) {
 if (!meaning.reviewCapabilities.length) return null;
 return <RatingControls language={language} height={28} compact disabled={busy}
   label={platformV2Message(language,"senseCard.sections.reviewPrompt")}
   options={meaning.reviewCapabilities.map(capability=>({rating:reviewRating[capability.reviewResult],label:platformV2Message(language,capability.messageKey)}))}
   onRate={(rating:Rating)=>{const capability=meaning.reviewCapabilities.find(item=>reviewRating[item.reviewResult]===rating);if(capability)onAction(capability);}}/>;
}
