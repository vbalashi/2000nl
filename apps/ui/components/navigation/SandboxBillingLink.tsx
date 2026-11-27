"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchSandboxCatalog } from "@/lib/billing/fetchSandboxCatalog";
import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";
import type { SandboxAccess } from "@/lib/billing/paddleSandboxAccess";
import { formatUiMessage, getUiMessages } from "@/lib/uiMessages";

export function SandboxBillingLink({ language }: { language: string }) {
  const [available, setAvailable] = useState(false);
  const [access, setAccess] = useState<SandboxAccess | null>(null);
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
        if (controller.signal.aborted) return;
        setAvailable(Boolean(catalog));
        const current = response?.ok ? await response.json() : null;
        if (!controller.signal.aborted) setAccess(current);
      } catch { /* Existing billing copy covers the unavailable path. */ }
      finally { reading = false; }
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
  if (!available && !access) return <p>{settings.subscriptionsUnavailable}</p>;
  const copy = settings.premiumOffer;
  const status = access?.active ? formatUiMessage(copy[access.endsAfterCancel ? "sandboxEnds" : "sandboxPaidUntil"], {
    plan: copy[access.plan],
    date: new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(access.validUntil)),
  }) : access ? copy.sandboxFree : null;

  return <>
    {status && <p role="status">{status}</p>}
    {available && !access?.active && <p><Link href={`/premium?language=${encodeURIComponent(language)}`}>{settings.explorePlans}</Link></p>}
  </>;
}
