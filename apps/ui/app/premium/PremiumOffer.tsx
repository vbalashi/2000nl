"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getUiMessages } from "@/lib/uiMessages";
import { fetchSandboxCatalog } from "@/lib/billing/fetchSandboxCatalog";
import { prepareSandboxOffer } from "@/lib/billing/paddleSandboxClient";
import { getSandboxCheckoutStatus, startSandboxCheckout } from "@/lib/billing/sandboxTransactionClient";
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
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [fulfillment, setFulfillment] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"completed" | "canceled" | "pending" | "statusError" | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const catalog = await fetchSandboxCatalog(controller.signal);
      if (controller.signal.aborted) return;
      const prepared = await prepareSandboxOffer(catalog);
      if (!controller.signal.aborted) {
        setOffer(prepared);
        setCheckoutReady(catalog.checkoutReady);
        setFulfillment(catalog.fulfillment);
      }
    }
    void load().catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [attempt]);

  async function startCheckout() {
    if (!offer || !checkoutReady || busy.current || receipt) return;
    busy.current = true;
    setCheckoutBusy(true);
    try {
      const transaction = await startSandboxCheckout(plan);
      offer.open(transaction.transactionId);
      setReceipt(transaction.receipt);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setCheckoutBusy(false);
    }
  }

  async function refreshPayment() {
    if (!receipt || busy.current) return;
    busy.current = true;
    setCheckoutBusy(true);
    try {
      setPaymentStatus(await getSandboxCheckoutStatus(receipt));
    } catch {
      setPaymentStatus("statusError");
    } finally {
      busy.current = false;
      setCheckoutBusy(false);
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
            <fieldset className={s.plans} disabled={!offer || checkoutBusy || Boolean(receipt)}>
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
            {!receipt && <button type="button" className={s.primary} disabled={!offer || !checkoutReady || failed || checkoutBusy} onClick={startCheckout}>{copy.checkout}</button>}
            {receipt && paymentStatus !== "completed" && paymentStatus !== "canceled" &&
              <button type="button" className={s.primary} disabled={checkoutBusy} onClick={refreshPayment}>{copy.checkPayment}</button>}
            <p className={s.notice} role="status">{failed ? copy.unavailable : paymentStatus ? copy[paymentStatus === "completed" && fulfillment ? "confirmedWithFulfillment" : paymentStatus] :
              !offer ? copy.loading : checkoutReady ? copy[fulfillment ? "sandboxEnabled" : "sandbox"] : copy.checkoutNotConfigured}</p>
            {receipt && paymentStatus !== "completed" && <button type="button" className={s.secondary} disabled={checkoutBusy} onClick={() => {
              setReceipt(null);
              setPaymentStatus(null);
            }}>{copy.newCheckout}</button>}
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
