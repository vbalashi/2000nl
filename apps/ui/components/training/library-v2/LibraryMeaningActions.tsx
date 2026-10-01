"use client";

import React from "react";
import { Check, Flag, List, MoreHorizontal } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/practice/ui/ActionMenu";
import { getUiMessages } from "@/lib/uiMessages";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { LibraryMutationCapability, LibrarySenseCardModel } from "./librarySenseCardModel";
import s from "@/components/practice/article/articleActions.module.css";

/** Presentation adapter; authoritative capabilities and callbacks stay with the owner. */
export function LibraryMeaningActions({ meaning, language, busy, collectionCount, onAction, onCollections, onTrainNext, onReport }: {
  meaning: LibrarySenseCardModel;
  language: OnboardingLanguage;
  busy: boolean;
  collectionCount: number;
  onAction: (capability: LibraryMutationCapability) => void;
  onCollections?: () => void;
  onTrainNext?: () => void;
  onReport?: () => void;
}) {
  const [anchor, setAnchor] = React.useState<HTMLButtonElement | null>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const close = React.useCallback(() => { setAnchor(null); trigger.current?.focus({preventScroll: true}); }, []);
  const t = (key: string) => platformV2Message(language, key);
  const labels = getUiMessages(language).library;
  const primary = meaning.undoKnown ?? meaning.startLearning;
  const items: ActionMenuItem[] = [];
  if (meaning.markKnown) items.push({id:"known",label:t(meaning.markKnown.messageKey),icon:<Check size={15} aria-hidden="true"/>,disabled:busy,
    onSelect:()=>{close();onAction(meaning.markKnown!);}});
  if (onReport) items.push({id:"report",label:t("senseCard.report"),icon:<Flag size={15} aria-hidden="true"/>,disabled:busy,
    onSelect:()=>{close();onReport();}});
  return <div data-testid="library-primary-actions" className={s.group}>
    {primary ? <button type="button" className={s.primary} disabled={busy} onClick={()=>onAction(primary)}>{t(primary.messageKey)}</button>
      : onTrainNext ? <button type="button" className={s.primary} disabled={busy} onClick={onTrainNext}>{t("senseCard.training.next")}</button> : null}
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
