"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getUiMessages } from "@/lib/uiMessages";
import { fetchSandboxCatalog } from "@/lib/billing/fetchSandboxCatalog";
import { prepareSandboxOffer } from "@/lib/billing/paddleSandboxClient";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import s from "./offer.module.css";

type Plan = "month" | "year";
type Offer = Awaited<ReturnType<typeof prepareSandboxOffer>>;

export function PremiumOffer({ language }: { language: string }) {
  const messages = getUiMessages(language);
  const copy = messages.settings.premiumOffer;
  const [plan, setPlan] = useState<Plan>("year");
  const [offer, setOffer] = useState<Offer | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const catalog = await fetchSandboxCatalog(controller.signal);
      if (controller.signal.aborted) return;
      const prepared = await prepareSandboxOffer(catalog);
      if (!controller.signal.aborted) setOffer(prepared);
    }
    void load().catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [attempt]);

  function startCheckout() {
    try {
      offer?.open(plan);
    } catch {
      setFailed(true);
    }
  }

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
          <section className={s.offer}>
            <fieldset className={s.plans} disabled={!offer}>
              <legend>{messages.settings.explorePlans}</legend>
              <div className={s.planRow}>
                {(["month", "year"] as const).map(option => (
                  <label key={option} className={s.plan} data-selected={option === plan}>
                    <span><input type="radio" name="premium-plan" checked={option === plan} onChange={() => setPlan(option)} />
                      {copy[option]}
                    </span>
                    {offer && <strong>{offer.amounts[option]}</strong>}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className={s.terms}>{copy[plan === "month" ? "monthlyTerms" : "yearlyTerms"]}</p>
            <button type="button" className={s.primary} disabled={!offer || failed} onClick={startCheckout}>{copy.checkout}</button>
            <p className={s.notice} role="status">{failed ? copy.unavailable : offer ? copy.sandbox : copy.loading}</p>
            {failed && <button type="button" className={s.secondary} onClick={() => {
              setFailed(false);
              setOffer(null);
              setAttempt(value => value + 1);
            }}>{copy.retry}</button>}
          </section>
        </div>
      </div>
    </main>
  );
}
