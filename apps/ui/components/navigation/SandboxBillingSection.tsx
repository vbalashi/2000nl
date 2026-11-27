"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, CreditCard, ReceiptText, Sparkles, XCircle } from "lucide-react";
import { fetchSandboxCatalog } from "@/lib/billing/fetchSandboxCatalog";
import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";
import type { SandboxAccess } from "@/lib/billing/paddleSandboxAccess";
import type { PortalAction } from "@/lib/billing/paddleSandboxPortal";
import { getUiMessages } from "@/lib/uiMessages";
import { useAssistantAccess } from "@/components/training/wordlist/useAssistantAccess";
import type { AssistantAllowances } from "@/lib/platform/assistantAllowanceContract";
import { AllowanceBalances } from "./AllowanceBalances";
import styles from "./sandboxBilling.module.css";

type BillingSummary = {
  access: SandboxAccess;
  nextPaymentAt: string | null;
  cancelAt: string | null;
  pastDue: boolean;
  actions: Record<PortalAction, boolean>;
};

type BillingState = { checkoutReady: boolean; summary: BillingSummary | null; unavailable: boolean };

export function SandboxBillingSection({ language, userId, offerOpen, onExplorePlans, preview }: {
  language: string;
  userId?: string;
  preview?: AssistantAllowances;
  offerOpen: boolean;
  onExplorePlans?: (opener: HTMLButtonElement) => void;
}) {
  const { allowances: liveAllowances } = useAssistantAccess(userId ?? "", !offerOpen && !preview);
  const allowances = preview ?? liveAllowances;
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [opening, setOpening] = useState<PortalAction | null>(null);
  const [portalError, setPortalError] = useState(false);
  const portalRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    if (offerOpen || preview) return;
    const controller = new AbortController();
    let reading = false;
    async function load() {
      if (reading) return;
      reading = true;
      try {
        const [catalog, response] = await Promise.all([
          fetchSandboxCatalog(controller.signal).catch(() => null),
          authenticatedJsonHeaders().then(headers => fetch("/api/billing/sandbox/access", {
            signal: controller.signal, headers, cache: "no-store",
          })).catch(() => null),
        ]);
        const summary = response?.ok ? await response.json() as BillingSummary : null;
        if (!controller.signal.aborted) setBilling({
          checkoutReady: Boolean(catalog?.checkoutReady), summary, unavailable: response?.status !== 404 && !summary,
        });
      } catch {
        if (!controller.signal.aborted) setBilling({ checkoutReady: false, summary: null, unavailable: true });
      } finally {
        reading = false;
      }
    }
    function refresh(event: PageTransitionEvent | Event) {
      if (event.type === "pageshow" && (event as PageTransitionEvent).persisted) {
        portalRequest.current?.abort();
        portalRequest.current = null;
        setOpening(null);
      }
      void load();
    }
    void load();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      controller.abort();
      portalRequest.current?.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [offerOpen, preview]);

  async function openPortal(action: PortalAction) {
    if (portalRequest.current) return;
    const controller = new AbortController();
    portalRequest.current = controller;
    setOpening(action);
    setPortalError(false);
    let navigating = false;
    try {
      const response = await fetch("/api/billing/sandbox/portal", {
        method: "POST", signal: controller.signal, headers: await authenticatedJsonHeaders(),
        body: JSON.stringify({ action }), cache: "no-store", referrerPolicy: "no-referrer",
      });
      if (!response.ok) throw new Error("sandbox_portal_unavailable");
      const { url } = await response.json();
      if (typeof url !== "string") throw new Error("sandbox_portal_unavailable");
      if (!controller.signal.aborted) {
        const link = document.createElement("a");
        link.href = url;
        link.rel = "noreferrer";
        link.click();
        navigating = true;
      }
    } catch {
      if (!controller.signal.aborted) setPortalError(true);
    } finally {
      if (!navigating && portalRequest.current === controller) {
        portalRequest.current = null;
        setOpening(null);
      }
    }
  }

  const settings = getUiMessages(language).settings;
  const copy = settings.premiumOffer;
  const summary = billing?.summary;
  if (!summary && !allowances) return (
    <section className={styles.billing} aria-label={settings.subscription}>
      <p className={styles.message} role="status">
        {!billing ? copy.billingLoading : billing.unavailable ? copy.billingStatusError : settings.subscriptionsUnavailable}
      </p>
    </section>
  );

  const access = summary?.access;
  const premium = allowances?.premium === true || access?.active === true;
  const cancellationDate = access?.active ? (summary?.cancelAt ?? (access.endsAfterCancel ? access.validUntil : null)) : null;
  const date = cancellationDate ?? summary?.nextPaymentAt ?? (access?.active ? access.validUntil : null);
  const dateLabel = cancellationDate ? copy.accessEnds : summary?.nextPaymentAt ? copy.nextPayment : copy.paidThrough;
  const status = cancellationDate ? copy.endsAtPeriod : summary?.pastDue ? copy.paymentOverdue : premium ? copy.activeStatus : null;
  const actions = [
    { id: "details", label: copy.detailsInvoices, Icon: ReceiptText },
    { id: "payment", label: copy.changePaymentMethod, Icon: CreditCard },
    { id: "cancel", label: copy.cancelSubscription, Icon: XCircle },
  ] as const;
  const availableActions = actions.filter(action => summary?.actions[action.id]);

  return (
    <section className={styles.billing} aria-labelledby="subscription-plan">
      <div className={styles.plan} data-premium={premium}>
        <div className={styles.planHeader}>
          <div className={styles.planIdentity}>
            <span className={styles.planIcon}><Sparkles aria-hidden="true" size={21} /></span>
            <div>
              <p className={styles.eyebrow}>{settings.subscription}</p>
              <h2 id="subscription-plan">{premium ? copy.premiumName : copy.freeName}</h2>
            </div>
          </div>
          {status && <span className={styles.badge} role="status">{status}</span>}
        </div>
        {(access?.active || date || allowances?.manualUntil) && <dl className={styles.facts}>
          {access?.active && <div><dt>{copy.planLabel}</dt><dd>{copy[access.plan]}</dd></div>}
          {date && <div><dt>{dateLabel}</dt><dd><time dateTime={date}>
            {new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(new Date(date))}
          </time></dd></div>}
          {allowances?.manualUntil && <div><dt>{copy.manualAccessUntil}</dt><dd><time dateTime={allowances.manualUntil}>
            {new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(new Date(allowances.manualUntil))}
          </time></dd></div>}
        </dl>}
        {!premium && (billing?.checkoutReady || preview) && onExplorePlans && <button type="button" className={styles.cta} onClick={event => onExplorePlans(event.currentTarget)}>
          {settings.explorePlans}<ArrowRight size={17} aria-hidden="true" />
        </button>}
        {(billing?.checkoutReady || preview) && <p className={styles.testNote}>{copy.sandboxEnabled}</p>}
      </div>
      {allowances && <AllowanceBalances language={language} allowances={allowances} />}
      {availableActions.length > 0 && <section className={styles.management} aria-labelledby="billing-actions">
        <h3 id="billing-actions">{settings.billingDetails}</h3>
        <div className={styles.actionList}>
          {availableActions.map(({ id, label, Icon }) => <button
            key={id} type="button" className={styles.portalAction} data-danger={id === "cancel"}
            disabled={opening !== null} aria-busy={opening === id} onClick={() => void openPortal(id)}
          >
            <Icon size={19} aria-hidden="true" />
            <span>{opening === id ? copy.openingPaddle : label}</span>
            <ArrowUpRight size={17} aria-hidden="true" />
          </button>)}
        </div>
        <p className={styles.message}>{copy.managedByPaddle}</p>
      </section>}
      {portalError && <p role="alert" className={styles.error}>{copy.paddleOpenError}</p>}
    </section>
  );
}
