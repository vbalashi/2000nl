"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { SandboxPlanCheckout, type SandboxCheckoutClient } from "@/components/billing/SandboxPlanCheckout";
import { getInterfaceCatalog } from "@/lib/i18n/catalog";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import s from "./premiumOffer.module.css";

type Entry = { entry: "legacy" } | { entry: "onboarding" | "settings" | "assistant" | "dictation" | "personalMeanings"; onDismiss: () => void };

export function PremiumOffer({ language, checkoutClient, previewColourMode, ...entry }: { language: string; checkoutClient?: SandboxCheckoutClient; previewColourMode?: "light" | "dark" } & Entry) {
  const catalog = getInterfaceCatalog(language);
  const copy = catalog.ui.settings.premiumOffer;
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const inApp = entry.entry !== "legacy";
  const [dismissLocked, setDismissLocked] = useState(false);
  const dismissLock = useRef(false);
  const reportDismissLock = useCallback((locked: boolean) => {
    dismissLock.current = locked;
    setDismissLocked(locked);
  }, []);
  const dismiss = () => {
    if (inApp && !dismissLock.current) entry.onDismiss();
  };
  const canClose = entry.entry === "settings" || entry.entry === "assistant" || entry.entry === "dictation" || entry.entry === "personalMeanings";

  useEffect(() => {
    if (inApp) title.current?.focus({ preventScroll: true });
  }, [inApp]);

  const Root = inApp ? "section" : "main";
  return (
    <Root className={`${theme.theme} ${s.screen}`} data-colour-mode={previewColourMode ?? "app"} lang={language}
      data-entry={entry.entry} data-overlay={inApp || undefined} data-contained={canClose || undefined}
      data-training-hotkeys-suspended={inApp || undefined}
      role={inApp ? "dialog" : undefined} aria-modal={inApp || undefined} aria-labelledby={titleId}
      onKeyDown={event => {
        if (canClose && event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          dismiss();
        }
      }}>
      <div className={s.surface}>
        <header className={s.header}>
          <BrandLogo as="span" className={s.brand} accentClassName={s.brandAccent} />
          {entry.entry === "legacy" && <Link href="/" className={s.close} aria-disabled={dismissLocked} tabIndex={dismissLocked ? -1 : undefined}
            onClick={event => { if (dismissLock.current) event.preventDefault(); }}><X size={17} aria-hidden="true" />{catalog.common.close}</Link>}
          {canClose && <button type="button" className={s.close} onClick={dismiss} disabled={dismissLocked}><X size={17} aria-hidden="true" />{catalog.common.close}</button>}
        </header>
        <div className={s.content}>
          <div className={s.story}>
            {(entry.entry === "assistant" || entry.entry === "dictation") && <div className={s.context}>
              <p>{entry.entry === "dictation" ? copy.dictationPremium : copy.assistantPremium}</p>
              <p>{copy.freeAllowanceExhausted}</p>
            </div>}
            {entry.entry === "personalMeanings" && <p className={s.tagline}>{copy.personalMeaningsPremium}</p>}
            <p className={s.tagline}>{copy.dictionaryGrows}</p>
            <p className={s.word} lang="nl">{copy.exampleWord}</p>
            <p className={s.meaning}>{copy.exampleMeaning}</p>
            <h1 id={titleId} ref={title} tabIndex={inApp ? -1 : undefined}>{copy.title}</h1>
            <p className={s.benefits}>{copy.meaningsAndDictionary}<br />{copy.wordCollections}</p>
          </div>
          <div className={s.purchase}>
            <SandboxPlanCheckout language={language} client={checkoutClient} onDismissLockChange={reportDismissLock} freeAction={entry.entry === "onboarding" && (
              <div className={s.freeDock}>
                <button type="button" className={s.continueFree} onClick={dismiss} disabled={dismissLocked}>
                  {copy.continueFree}<ArrowRight size={17} aria-hidden="true" />
                </button>
              </div>
            )} />
          </div>
        </div>
      </div>
    </Root>
  );
}
