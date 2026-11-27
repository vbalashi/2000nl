"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SettingsPanel, SettingsRow } from "@/components/practice/settings/SettingsLayout";
import styles from "@/components/practice/settings/settings.module.css";
import { fetchSandboxCatalog } from "@/lib/billing/fetchSandboxCatalog";
import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";
import type { SandboxAccess } from "@/lib/billing/paddleSandboxAccess";
import { formatUiMessage, getUiMessages } from "@/lib/uiMessages";

type BillingState = {
  checkoutReady: boolean;
  access: SandboxAccess | null;
  portalUrl: string | null;
  accessUnavailable: boolean;
};

export function SandboxBillingSection({ language }: { language: string }) {
  const [billing, setBilling] = useState<BillingState | null>(null);
  useEffect(() => {
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
        const payload = response?.ok ? await response.json() : null;
        if (!controller.signal.aborted) setBilling({
          checkoutReady: Boolean(catalog?.checkoutReady),
          access: payload?.access ?? null,
          portalUrl: payload?.portalUrl ?? null,
          accessUnavailable: response?.status !== 404 && !payload,
        });
      } catch {
        if (!controller.signal.aborted) setBilling({
          checkoutReady: false, access: null, portalUrl: null, accessUnavailable: true,
        });
      } finally {
        reading = false;
      }
    }
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const settings = getUiMessages(language).settings;
  const copy = settings.premiumOffer;
  const access = billing?.access;
  const status = access?.active ? formatUiMessage(copy[access.endsAfterCancel ? "sandboxEnds" : "sandboxPaidUntil"], {
    plan: copy[access.plan],
    date: new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(access.validUntil)),
  }) : access ? copy.sandboxFree : null;

  return <>
    <SettingsPanel title={settings.subscription}>
      <p role="status" className={styles.hint}>
        {status ?? (!billing ? copy.billingLoading : billing.accessUnavailable ? copy.billingStatusError : settings.subscriptionsUnavailable)}
      </p>
      {billing?.checkoutReady && !access?.active && !billing.accessUnavailable &&
        <p><Link href={`/premium?language=${encodeURIComponent(language)}`}>{settings.explorePlans}</Link></p>}
    </SettingsPanel>
    <SettingsPanel title={settings.billingDetails}>
      {billing?.portalUrl ? <SettingsRow title={copy.manageSubscription} hint={copy.manageSubscriptionHint}>
        <a className={styles.select} href={billing.portalUrl} target="_blank" rel="noopener noreferrer">{copy.openPaddlePortal}</a>
      </SettingsRow> : billing && <p className={styles.hint}>{settings.billingUnavailable}</p>}
    </SettingsPanel>
  </>;
}
