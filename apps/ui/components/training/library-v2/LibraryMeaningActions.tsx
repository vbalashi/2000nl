"use client";

import React from "react";
import { RatingControls, type Rating } from "@/components/practice/RatingControls";
import { Check, EyeOff, Flag, List, MoreHorizontal, ChartNoAxesColumn } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/practice/ui/ActionMenu";
import { getUiMessages } from "@/lib/uiMessages";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { LibraryMutationCapability, LibrarySenseCardModel } from "./librarySenseCardModel";
import s from "@/components/practice/article/articleActions.module.css";

/** Presentation adapter; authoritative capabilities and callbacks stay with the owner. */
export function LibraryMeaningActions({ meaning, language, busy, collectionCount, onAction, onCollections, onReport, onExclude, exclusionDisabled, onProgress, onResume }: {
  meaning: LibrarySenseCardModel;
  language: OnboardingLanguage;
  busy: boolean;
  collectionCount: number;
  onAction: (capability: LibraryMutationCapability) => void;
  onCollections?: () => void;
  onTrainNext?: () => void;
  onReport?: () => void;
  onExclude?: () => void;
  onProgress?: () => void;
  onResume?: () => void;
  exclusionDisabled?: boolean;
}) {
  const [anchor, setAnchor] = React.useState<HTMLButtonElement | null>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const close = React.useCallback(() => { setAnchor(null); trigger.current?.focus({preventScroll: true}); }, []);
  const t = (key: string) => platformV2Message(language, key);
  const labels = getUiMessages(language).library;
  const primary = meaning.undoKnown ?? meaning.startLearning;
  const blocked = Boolean(meaning.meaningProgress?.exclusionId || meaning.meaningProgress?.directions.some(d=>d.knownMarkId) || meaning.undoKnown);
  const items: ActionMenuItem[] = [];
  if(onProgress)items.push({id:"progress",label:getUiMessages(language).learningProgress.title,icon:<ChartNoAxesColumn size={15} aria-hidden="true"/>,onSelect:()=>{close();onProgress();}});
  if (onExclude) items.push({id:"exclude",label:getUiMessages(language).trainingSession.exclusion.headwordLabel,description:getUiMessages(language).trainingSession.exclusion.headwordHelp,icon:<EyeOff size={15} aria-hidden="true"/>,disabled:busy || exclusionDisabled,
    onSelect:()=>{close();onExclude();}});
  if (meaning.markKnown) items.push({id:"known",label:t(meaning.markKnown.messageKey),description:getUiMessages(language).cardActions.knownHelp,icon:<Check size={15} aria-hidden="true"/>,disabled:busy,
    onSelect:()=>{close();onAction(meaning.markKnown!);}});
  if (onReport) items.push({id:"report",label:t("senseCard.report"),icon:<Flag size={15} aria-hidden="true"/>,disabled:busy,
    onSelect:()=>{close();onReport();}});
  return <div data-testid="library-primary-actions" className={s.group}>
    {blocked && onResume ? <button type="button" className={s.primary} disabled={busy} onClick={onResume}>{getUiMessages(language).learningProgress.resume}</button> : primary ? <button type="button" className={s.primary} disabled={busy} onClick={()=>onAction(primary)}>{t(primary.messageKey)}</button>
      : null}
    {!primary && !blocked ? <LibraryMeaningRatings meaning={meaning} language={language} busy={busy} onAction={onAction}/> : null}
    <div data-testid="library-service-actions" className={s.row}>
      {onCollections ? <button type="button" className={s.quiet} aria-haspopup="dialog" onClick={onCollections}>
        <List size={14} aria-hidden="true"/>{t("senseCard.collections.label")}{collectionCount > 0 ? ` · ${new Intl.NumberFormat(language).format(collectionCount)}` : ""}
      </button> : null}
      <span className={s.spacer}/>
      {items.length ? <button ref={trigger} type="button" className={s.quiet} disabled={busy}
        aria-label={labels.moreActions} aria-haspopup="menu" aria-expanded={Boolean(anchor)}
        onClick={event=>anchor?close():setAnchor(event.currentTarget)}><MoreHorizontal size={18} aria-hidden="true"/></button> : null}
    </div>
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
