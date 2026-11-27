"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { getUiMessages } from "@/lib/uiMessages";
import { fetchSandboxCatalog } from "@/lib/billing/fetchSandboxCatalog";
import { prepareSandboxOffer, type SandboxCheckoutSummary } from "@/lib/billing/paddleSandboxClient";
import { getSandboxCheckoutStatus, startSandboxCheckout } from "@/lib/billing/sandboxTransactionClient";
import s from "./sandboxPlanCheckout.module.css";

type Plan = "month" | "year";
type Offer = Awaited<ReturnType<typeof prepareSandboxOffer>>;
type CheckoutPhase = "selectable" | "pending" | "completed";
type CheckoutTransaction = Awaited<ReturnType<typeof startSandboxCheckout>>;
export type SandboxCheckoutClient = {
  prepare(signal: AbortSignal): Promise<{ offer: Offer; checkoutReady: boolean; fulfillment: boolean } | null>;
  start: typeof startSandboxCheckout;
  status: typeof getSandboxCheckoutStatus;
};

const paddleClient: SandboxCheckoutClient = {
  async prepare(signal) {
    const catalog = await fetchSandboxCatalog(signal);
    if (signal.aborted) return null;
    return { offer: await prepareSandboxOffer(catalog), checkoutReady: catalog.checkoutReady, fulfillment: catalog.fulfillment };
  },
  start: startSandboxCheckout,
  status: getSandboxCheckoutStatus,
};

export function SandboxPlanCheckout({ language, freeAction, client = paddleClient, onDismissLockChange }: {
  language: string;
  freeAction?: ReactNode;
  client?: SandboxCheckoutClient;
  onDismissLockChange?: (locked: boolean) => void;
}) {
  const planGroup = useId();
  const frameClass = `paddle-frame-${planGroup.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const heading = useRef<HTMLHeadingElement>(null);
  const checkoutButton = useRef<HTMLButtonElement>(null);
  const region = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  const messages = getUiMessages(language);
  const copy = messages.settings.premiumOffer;
  const [plan, setPlan] = useState<Plan>("year");
  const [offer, setOffer] = useState<Offer | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [fulfillment, setFulfillment] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [transaction, setTransaction] = useState<CheckoutTransaction | null>(null);
  const [summary, setSummary] = useState<SandboxCheckoutSummary | null>(null);
  const [phase, setPhase] = useState<CheckoutPhase>("selectable");
  const [frameClosed, setFrameClosed] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"completed" | "canceled" | "pending" | "statusError" | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const checkoutSession = useRef<ReturnType<Offer["open"]> | null>(null);
  const statusVerified = useRef(false);
  const awaitingVerification = Boolean(transaction) && (phase !== "selectable" || frameClosed) &&
    paymentStatus !== "completed" && paymentStatus !== "canceled";

  useLayoutEffect(() => {
    onDismissLockChange?.(awaitingVerification);
  }, [awaitingVerification, onDismissLockChange]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const prepared = await client.prepare(controller.signal);
      if (!controller.signal.aborted && prepared) {
        setOffer(prepared.offer);
        setCheckoutReady(prepared.checkoutReady);
        setFulfillment(prepared.fulfillment);
      }
    }
    void load().catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [attempt, client]);

  useEffect(() => {
    if (!offer || !region.current || !transaction) return;
    heading.current?.focus();
    let observedPhase: CheckoutPhase = "selectable";
    const timeout = setTimeout(() => {
      if (observedPhase !== "selectable") {
        if (!statusVerified.current) setPaymentStatus("pending");
        return;
      }
      setFailed(true);
      setTransaction(null);
    }, 20000);
    try {
      checkoutSession.current = offer.open(transaction.transactionId, {
        frameTarget: frameClass,
        theme: getComputedStyle(region.current).colorScheme === "dark" ? "dark" : "light",
        onSummary: details => {
          clearTimeout(timeout);
          setSummary(details);
        },
        onPhase: next => {
          observedPhase = next;
          if (next !== "selectable" && !statusVerified.current) onDismissLockChange?.(true);
          setPhase(next);
        },
        onClose: abandoned => {
          clearTimeout(timeout);
          if (abandoned) {
            restoreFocus.current = true;
            setTransaction(null);
            setPaymentStatus(null);
          } else {
            if (!statusVerified.current) onDismissLockChange?.(true);
            setFrameClosed(true);
          }
        },
      });
    } catch {
      clearTimeout(timeout);
      if (observedPhase !== "selectable") {
        setFrameClosed(true);
        setPaymentStatus("pending");
      } else {
        setFailed(true);
        setTransaction(null);
      }
    }
    return () => {
      clearTimeout(timeout);
      checkoutSession.current?.dispose();
      checkoutSession.current = null;
    };
  }, [frameClass, offer, onDismissLockChange, transaction]);

  useEffect(() => {
    if (!transaction && restoreFocus.current) {
      checkoutButton.current?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [transaction]);

  async function startCheckout() {
    if (!offer || !checkoutReady || busy.current || transaction) return;
    busy.current = true;
    setCheckoutBusy(true);
    try {
      const next = await client.start(plan);
      if (!mounted.current) return;
      statusVerified.current = false;
      setSummary(null);
      setPhase("selectable");
      setFrameClosed(false);
      setPaymentStatus(null);
      setTransaction(next);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      busy.current = false;
      if (mounted.current) setCheckoutBusy(false);
    }
  }

  async function refreshPayment() {
    if (!transaction || busy.current) return;
    busy.current = true;
    setCheckoutBusy(true);
    try {
      const status = await client.status(transaction.receipt);
      if (mounted.current) {
        statusVerified.current = status === "completed" || status === "canceled";
        setPaymentStatus(status);
      }
    } catch {
      if (mounted.current) setPaymentStatus("statusError");
    } finally {
      busy.current = false;
      if (mounted.current) setCheckoutBusy(false);
    }
  }

  const terms = copy[plan === "month" ? "monthlyTerms" : "yearlyTerms"];
  const formatAmount = summary && new Intl.NumberFormat(language, { style: "currency", currency: summary.currency, currencyDisplay: "code" });
  const showFrame = !frameClosed && paymentStatus !== "completed" && paymentStatus !== "canceled";
  const notice = failed ? copy.unavailable : paymentStatus ? copy[paymentStatus === "completed" && fulfillment ? "confirmedWithFulfillment" : paymentStatus] :
    !offer ? copy.loading : checkoutReady ? copy[fulfillment ? "sandboxEnabled" : "sandbox"] : copy.checkoutNotConfigured;

  return (
    <section ref={region} className={s.offer} data-checkout-active={transaction ? "true" : undefined}>
      {transaction ? (
        <>
          <div className={s.paymentBar}>
            <h2 ref={heading} tabIndex={-1}>{copy.paymentDetails}</h2>
            {phase === "selectable" && !frameClosed && <button type="button" className={s.back} disabled={checkoutBusy}
              onClick={() => checkoutSession.current?.closeIfUnpaid()}>
              <ArrowLeft size={16} aria-hidden="true" />{copy.changePlan}
            </button>}
          </div>
          <section className={s.summary} aria-labelledby={`${frameClass}-summary`}>
            <h3 id={`${frameClass}-summary`}>{copy.orderSummary}</h3>
            <p className={s.lineItem}><strong>{copy.name}</strong><span>{copy[plan]}</span></p>
            <p className={s.terms}>{terms}</p>
            {summary && formatAmount && (
              <dl className={s.amounts}>
                <div><dt>{copy.subtotal}</dt><dd>{formatAmount.format(summary.subtotal)}</dd></div>
                {summary.discount > 0 && <div><dt>{copy.checkoutDiscount}</dt><dd>{formatAmount.format(-summary.discount)}</dd></div>}
                <div><dt>{copy.salesTax}</dt><dd>{formatAmount.format(summary.tax)}</dd></div>
                {summary.credit > 0 && <div><dt>{copy.checkoutCredit}</dt><dd>{formatAmount.format(-summary.credit)}</dd></div>}
                <div className={s.due}><dt>{copy.totalDue}</dt><dd>{formatAmount.format(summary.due)}</dd></div>
                <div className={s.renewal}><dt>{copy.renewalTotal}</dt><dd>{formatAmount.format(summary.renewal)}</dd></div>
              </dl>
            )}
          </section>
          {showFrame && <div className={s.paymentBody}>
            {!summary && <p className={s.frameStatus} role="status">{copy.openingPaddle}</p>}
            <div className={`${s.checkoutFrame} ${frameClass}`} data-ready={summary ? "true" : undefined} />
          </div>}
          {awaitingVerification && (frameClosed || phase === "completed" || paymentStatus != null) &&
            <button type="button" className={s.primary} disabled={checkoutBusy} onClick={refreshPayment}>{copy.checkPayment}</button>}
          {paymentStatus === "canceled" && <button type="button" className={s.secondary} disabled={checkoutBusy}
            onClick={() => {
              restoreFocus.current = true;
              setTransaction(null);
              setPaymentStatus(null);
            }}>{copy.newCheckout}</button>}
        </>
      ) : (
        <>
          <fieldset className={s.plans} disabled={!offer || checkoutBusy}>
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
          <p className={s.terms}>{terms}</p>
          <LegalLinks />
          <button ref={checkoutButton} type="button" className={s.primary}
            disabled={!offer || !checkoutReady || failed || checkoutBusy} onClick={startCheckout}>{copy.checkout}</button>
          {freeAction}
        </>
      )}
      <p className={s.notice} role="status">{notice}</p>
      {failed && <button type="button" className={s.secondary} onClick={() => {
        setFailed(false);
        setOffer(null);
        setAttempt(value => value + 1);
      }}>{copy.retry}</button>}
    </section>
  );
}
