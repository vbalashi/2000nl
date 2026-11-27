"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { SandboxPlanCheckout } from "@/components/billing/SandboxPlanCheckout";
import { getInterfaceCatalog } from "@/lib/i18n/catalog";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import s from "./premiumOffer.module.css";

type Entry = { entry: "legacy" } | { entry: "onboarding" | "settings"; onDismiss: () => void };

export function PremiumOffer({ language, ...entry }: { language: string } & Entry) {
  const catalog = getInterfaceCatalog(language);
  const copy = catalog.ui.settings.premiumOffer;
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const inApp = entry.entry !== "legacy";
  const onDismiss = inApp ? entry.onDismiss : undefined;

  useEffect(() => {
    if (inApp) title.current?.focus({ preventScroll: true });
  }, [inApp]);

  const Root = inApp ? "section" : "main";
  return (
    <Root className={`${theme.theme} ${s.screen}`} data-colour-mode="app" lang={language}
      data-overlay={inApp || undefined} data-training-hotkeys-suspended={inApp || undefined}
      role={inApp ? "dialog" : undefined} aria-modal={inApp || undefined} aria-labelledby={titleId}
      onKeyDown={event => {
        if (entry.entry === "settings" && event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          entry.onDismiss();
        }
      }}>
      <header className={s.header}>
        <BrandLogo as="span" className={s.brand} accentClassName={s.brandAccent} />
        {entry.entry === "legacy" && <Link href="/" className={s.close}><X size={17} aria-hidden="true" />{catalog.common.close}</Link>}
        {entry.entry === "settings" && <button type="button" className={s.close} onClick={onDismiss}><X size={17} aria-hidden="true" />{catalog.common.close}</button>}
      </header>
      <div className={s.content}>
        <div className={s.story}>
          <p className={s.tagline}>{copy.dictionaryGrows}</p>
          <p className={s.word} lang="nl">{copy.exampleWord}</p>
          <p className={s.meaning}>{copy.exampleMeaning}</p>
          <h1 id={titleId} ref={title} tabIndex={inApp ? -1 : undefined}>{copy.title}</h1>
          <p className={s.benefits}>{copy.meaningsAndDictionary}<br />{copy.wordCollections}</p>
        </div>
        <div className={s.purchase}>
          <SandboxPlanCheckout language={language} freeAction={entry.entry === "onboarding" && (
            <button type="button" className={s.continueFree} onClick={onDismiss}>
              {copy.continueFree}<ArrowRight size={17} aria-hidden="true" />
            </button>
          )} />
        </div>
      </div>
    </Root>
  );
}
