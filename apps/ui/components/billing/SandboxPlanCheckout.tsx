"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { getUiMessages } from "@/lib/uiMessages";
import { fetchSandboxCatalog } from "@/lib/billing/fetchSandboxCatalog";
import { prepareSandboxOffer } from "@/lib/billing/paddleSandboxClient";
import { getSandboxCheckoutStatus, startSandboxCheckout } from "@/lib/billing/sandboxTransactionClient";
import s from "./sandboxPlanCheckout.module.css";

type Plan = "month" | "year";
type Offer = Awaited<ReturnType<typeof prepareSandboxOffer>>;

export function SandboxPlanCheckout({ language }: { language: string }) {
  const planGroup = useId();
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
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

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
      if (!mounted.current) return;
      offer.open(transaction.transactionId);
      setReceipt(transaction.receipt);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      busy.current = false;
      if (mounted.current) setCheckoutBusy(false);
    }
  }

  async function refreshPayment() {
    if (!receipt || busy.current) return;
    busy.current = true;
    setCheckoutBusy(true);
    try {
      const status = await getSandboxCheckoutStatus(receipt);
      if (mounted.current) setPaymentStatus(status);
    } catch {
      if (mounted.current) setPaymentStatus("statusError");
    } finally {
      busy.current = false;
      if (mounted.current) setCheckoutBusy(false);
    }
  }

  return (
    <section className={s.offer}>
      <fieldset className={s.plans} disabled={!offer || checkoutBusy || Boolean(receipt)}>
        <legend>{copy.premiumPlans}</legend>
        <div className={s.planRow}>
          {(["month", "year"] as const).map(option => (
            <label key={option} className={s.plan} data-selected={option === plan}>
              <span><input type="radio" name={planGroup} checked={option === plan} onChange={() => setPlan(option)} />
                {copy[option]}
              </span>
              {offer && <strong>{offer.amounts[option]}</strong>}
            </label>
          ))}
        </div>
      </fieldset>
      <p className={s.terms}>{copy[plan === "month" ? "monthlyTerms" : "yearlyTerms"]}</p>
      <LegalLinks />
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
  );
}
