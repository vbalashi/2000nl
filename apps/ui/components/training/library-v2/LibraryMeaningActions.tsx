"use client";
import { getInterfaceCatalog, localizedField } from "@/lib/i18n/catalog";

import React from "react";
import { RatingControls, type Rating } from "@/components/practice/RatingControls";
import { Check, ChevronDown, Flag, List, MoreHorizontal, ChartNoAxesColumn, LockKeyhole, Plus, Minus, Pencil, Archive, Copy, StickyNote } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/practice/ui/ActionMenu";
import { getUiMessages } from "@/lib/uiMessages";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { LibraryMutationCapability, LibrarySenseCardModel } from "./librarySenseCardModel";
import { authorEntryArchiveCopy } from "@/lib/platform/authorEntryArchiveCopy";
import { independentEntryCopyText } from "@/lib/platform/independentEntryCopyText";
import s from "@/components/practice/article/articleActions.module.css";

/** Presentation adapter; authoritative capabilities and callbacks stay with the owner. */
export function LibraryMeaningActions({ meaning, language, busy, collectionCount, currentCollection, recentCollections, onAction, onCollections, onReport, onExclude, onEditPersonal, onArchive, onCopy, onEditNote, exclusionDisabled, onProgress, onResume, activeTraining = false, headwordTrainingBlocked = false, reviewButton = true, savedReview }: {
  activeTraining?: boolean;
  headwordTrainingBlocked?: boolean;
  reviewButton?: boolean;
  savedReview?: LibraryReviewReceipt;
  meaning: LibrarySenseCardModel;
  language: OnboardingLanguage;
  busy: boolean;
  collectionCount: number;
  currentCollection?: { name: string; included: boolean | null; busy: boolean; onToggle: () => void };
  onAction: (capability: LibraryMutationCapability) => void;
  recentCollections?: {id:string;name:string;included:boolean;disabled:boolean;onToggle:(included:boolean)=>void}[];
  onCollections?: () => void;
  onTrainNext?: () => void;
  onReport?: () => void;
  onExclude?: () => void;
  onEditPersonal?: () => void;
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
  if (onExclude) items.push({id:"exclude",label:getUiMessages(language).trainingSession.exclusion.headwordLabel,description:activeTraining ? protectionCopy.actionHint : headwordTrainingBlocked ? protectionCopy.headwordHint : getUiMessages(language).trainingSession.exclusion.headwordHelp,icon:<Check size={15} aria-hidden="true"/>,disabled:busy || exclusionDisabled || activeTraining || headwordTrainingBlocked,
    onSelect:()=>{if(activeTraining || headwordTrainingBlocked)return;close();onExclude();}});
  if (meaning.markKnown) items.push({id:"known",label:t(meaning.markKnown.messageKey),description:activeTraining ? protectionCopy.actionHint : getUiMessages(language).cardActions.knownHelp,icon:<Check size={15} aria-hidden="true"/>,disabled:busy || activeTraining,
    onSelect:()=>{if(activeTraining)return;close();onAction(meaning.markKnown!);}});
  if (onReport) items.push({id:"report",label:t("senseCard.report"),icon:<Flag size={15} aria-hidden="true"/>,disabled:busy,
    onSelect:()=>{close();onReport();}});
  if(onEditNote)items.push({id:'own-note',label:localizedField("meaningActions", "personalNote")[language],icon:<StickyNote size={15} aria-hidden="true"/>,disabled:busy,onSelect:()=>{close();onEditNote();}});
  if (onEditPersonal) items.unshift({id:"edit-personal",label:getInterfaceCatalog(language).features.personalCard.editCard,icon:<Pencil size={15}/>,onSelect:()=>{close();onEditPersonal();}});
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
  for (const list of recentCollections ?? []) collectionItems.push({id:`recent-${list.id}`,label:list.name,description:platformV2Message(language,list.included ? "senseCard.collections.removeCurrent" : "senseCard.collections.addCurrent",{name:list.name}),icon:list.included ? <Check size={15} aria-hidden="true"/> : <Plus size={15} aria-hidden="true"/>,disabled:list.disabled || busy,onSelect:()=>list.onToggle(list.included)});
  if (onCollections) collectionItems.push({ id: "choose-collections", label: t("senseCard.collections.choose"), icon: <List size={15} aria-hidden="true"/>,
    onSelect: () => { closeCollections(); onCollections(); },
  });
  return <div data-testid="library-primary-actions" className={s.group}>
    {activeTraining ? <div className={s.trainingGuard} role="note" data-testid="active-training-card-notice">
      <LockKeyhole size={16} aria-hidden="true"/><div><strong>{protectionCopy.title}</strong><span>{protectionCopy.hint}</span></div>
    </div> : blocked && onResume ? <button type="button" className={s.primary} disabled={busy || resumeBlocked} onClick={()=>{if(!resumeBlocked)onResume();}}>{getUiMessages(language).learningProgress.resume}</button> : primary ? <button type="button" className={s.primary} disabled={busy} onClick={()=>onAction(primary)}>{t(primary.messageKey)}</button>
      : null}
    {!activeTraining && !primary && !blocked ? (reviewButton
      ? <LibraryReviewButton meaning={meaning} language={language} busy={busy} onAction={onAction} savedReview={savedReview}/>
      : <LibraryMeaningRatings meaning={meaning} language={language} busy={busy} onAction={onAction}/>) : null}
    {!activeTraining && resumeBlocked && blocked ? <p className={s.status}>{protectionCopy.headwordHint}</p> : null}
    <div data-testid="library-service-actions" className={s.row}>
      {onCollections ? <button data-onboarding="meaning-collections" ref={collectionTrigger} type="button" className={s.quiet}
        aria-haspopup={collectionItems.length>1 ? "menu" : "dialog"} aria-expanded={Boolean(collectionAnchor)}
        onClick={event => collectionItems.length===1 ? onCollections() : collectionAnchor ? closeCollections() : setCollectionAnchor(event.currentTarget)}>
        <List size={14} aria-hidden="true"/>{t("senseCard.collections.label")}{collectionCount > 0 ? ` · ${new Intl.NumberFormat(language).format(collectionCount)}` : ""}
      </button> : null}
      <span className={s.spacer}/>
      {items.length ? <button ref={trigger} type="button" className={s.quiet} disabled={busy}
        aria-label={labels.moreActions} aria-haspopup="menu" aria-expanded={Boolean(anchor)}
        onClick={event=>anchor?close():setAnchor(event.currentTarget)}><MoreHorizontal size={18} aria-hidden="true"/></button> : null}
    </div>
    {collectionAnchor ? <ActionMenu anchor={collectionAnchor} title={t("senseCard.collections.label")} language={language} items={collectionItems} onClose={closeCollections}/> : null}
    {anchor ? <ActionMenu followAnchor anchor={anchor} title={getUiMessages(language).cardActions.title} language={language} items={items} onClose={close}/> : null}
  </div>;
}

const reviewRating = { fail: "Again", hard: "Hard", success: "Good", easy: "Easy" } as const;
/** Only authoritative direct capabilities are projected by the Library model. */
type ReviewProps = {
  meaning: LibrarySenseCardModel;
  language: OnboardingLanguage;
  busy: boolean;
  onAction: (capability: LibraryMutationCapability) => void;
};

export type LibraryReviewReceipt = { messageKey: string; revision: string };

export function LibraryMeaningRatings({meaning,language,busy,onAction,firstRef}: ReviewProps & {firstRef?: React.Ref<HTMLButtonElement>}) {
 if (!meaning.reviewCapabilities.length) return null;
 return <RatingControls language={language} height={28} compact disabled={busy} firstRef={firstRef}
   label={platformV2Message(language,"senseCard.sections.reviewPrompt")}
   options={meaning.reviewCapabilities.map(capability=>({rating:reviewRating[capability.reviewResult],label:platformV2Message(language,capability.messageKey)}))}
   onRate={(rating:Rating)=>{const capability=meaning.reviewCapabilities.find(item=>reviewRating[item.reviewResult]===rating);if(capability)onAction(capability);}}/>;
}

const gradeKeys = { 1: "fail", 2: "hard", 3: "success", 4: "easy" } as const;
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

function relativeReviewTime(language: OnboardingLanguage, remaining: number): string {
  const [unit, divisor] = remaining >= day ? ["day", day] as const
    : remaining >= hour ? ["hour", hour] as const : ["minute", minute] as const;
  return new Intl.RelativeTimeFormat(language).format(Math.max(1, Math.round(remaining / divisor)), unit);
}

function LibraryReviewButton({ meaning, language, busy, onAction, savedReview }: ReviewProps & {
  savedReview?: LibraryReviewReceipt;
}) {
  const revision = meaning.reviewCapabilities[0]?.target.stateRevision;
  const receipt = savedReview?.revision === revision ? savedReview : undefined;
  const [expandedFor, setExpandedFor] = React.useState<{ revision: string; receipt?: LibraryReviewReceipt } | null>(null);
  const expanded = expandedFor !== null && expandedFor.revision === revision && expandedFor.receipt === receipt;
  const [clock, updateClock] = React.useState(Date.now);
  const dueAt = meaning.nextDueAt ? Date.parse(meaning.nextDueAt) : NaN;
  const remaining = dueAt - clock;
  const firstRating = React.useRef<HTMLButtonElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const restoreFocus = React.useRef(false);

  React.useEffect(() => {
    if (!(remaining > 0)) return;
    const timer = window.setTimeout(() => updateClock(Date.now()), Math.min(remaining, minute));
    return () => window.clearTimeout(timer);
  }, [remaining]);

  React.useLayoutEffect(() => {
    if (expanded) firstRating.current?.focus();
    else if (!busy && restoreFocus.current && trigger.current) {
      trigger.current.focus();
      restoreFocus.current = false;
    }
  }, [busy, expanded]);

  if (!revision) return null;
  const t = (key: string) => platformV2Message(language, key);
  const grade = meaning.lastGrade ? t(`senseCard.review.${gradeKeys[meaning.lastGrade]}`) : null;
  const status = receipt ? platformV2Message(language, "senseCard.learning.reviewSaved", { rating: t(receipt.messageKey) })
    : remaining <= 0 && grade ? t("senseCard.learning.reviewDue")
    : grade ? `${t("senseCard.state.lastGrade")} · ${grade}`
    : t("senseCard.learning.rate");
  const timing = remaining > 0 ? relativeReviewTime(language, remaining) : null;

  if (expanded) return <div onKeyDown={event => {
    if (event.key === "Escape" && !busy) {
      event.stopPropagation();
      restoreFocus.current = true;
      setExpandedFor(null);
    }
  }}>
    <LibraryMeaningRatings meaning={meaning} language={language} busy={busy} onAction={onAction} firstRef={firstRating}/>
  </div>;

  return <button type="button" ref={trigger} className={`${s.primary} ${s.reviewPrimary}`}
    aria-expanded={false} disabled={busy} onClick={() => {
      updateClock(Date.now());
      restoreFocus.current = true;
      setExpandedFor({ revision, receipt });
    }}>
    {receipt ? <Check size={13} aria-hidden="true"/> : null}
    <span>{status}{timing ? <span className={s.reviewTiming}>
      {" · "}<span className="sr-only">{t("senseCard.state.nextReview")}{" "}</span>{timing}
    </span> : null}</span>
    <ChevronDown size={13} aria-hidden="true"/>
  </button>;
}
