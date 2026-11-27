"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchSandboxCatalog } from "@/lib/billing/fetchSandboxCatalog";
import { getUiMessages } from "@/lib/uiMessages";

export function SandboxBillingLink({ language }: { language: string }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetchSandboxCatalog(controller.signal).then(() => {
      if (!controller.signal.aborted) setAvailable(true);
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  if (!available) return null;
  return <p><Link href={`/premium?language=${encodeURIComponent(language)}`}>{getUiMessages(language).settings.explorePlans}</Link></p>;
}
