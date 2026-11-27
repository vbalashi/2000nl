"use client";

import Link from "next/link";
import { SandboxPlanCheckout } from "@/components/billing/SandboxPlanCheckout";
import { getUiMessages } from "@/lib/uiMessages";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import s from "./offer.module.css";

export function PremiumOffer({ language }: { language: string }) {
  const copy = getUiMessages(language).settings.premiumOffer;
  return (
    <main className={`${theme.theme} ${s.preview}`} data-colour-mode="app" lang={language}>
      <div className={s.screen}>
        <header className={s.header}>
          <span className={s.brand}>2000<span>nl</span></span>
          <Link href="/">{copy.back}</Link>
        </header>
        <div className={s.content}>
          <section className={s.story} aria-labelledby="offer-title">
            <p className={s.eyebrow}>{copy.name}</p>
            <p className={s.word} lang="nl">{copy.exampleWord}</p>
            <p className={s.definition}>{copy.exampleMeaning}</p>
            <h1 id="offer-title">{copy.title}</h1>
            <p className={s.benefits}>{copy.benefits}</p>
          </section>
          <SandboxPlanCheckout language={language} />
        </div>
      </div>
    </main>
  );
}
