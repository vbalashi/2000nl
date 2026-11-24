"use client";

import React, { useState } from "react";
import { CalendarClock } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { interfaceFormattingLocale } from "@/lib/i18n/registry";
import { formatUiMessage, getUiMessages } from "@/lib/uiMessages";
import { ReleaseBanner } from "@/components/releases/ReleaseUpdates";
import styles from "@/components/releases/ReleaseUpdates.module.css";
import actions from "@/components/practice/ui/launchAction.module.css";
import { useMaintenanceNotice } from "./MaintenanceBoundary";

const dismissalKey = "2000nl:maintenance-dismissed";

function Notice({
  language,
  identity,
  startsAt,
  expiresAt,
}: {
  language: OnboardingLanguage;
  identity: string;
  startsAt: number;
  expiresAt: number;
}) {
  const token = JSON.stringify({ identity, expiresAt });
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(dismissalKey) === token;
    } catch {
      return false;
    }
  });

  if (dismissed) return <ReleaseBanner language={language} />;

  const copy = getUiMessages(language).maintenance;
  const start = new Intl.DateTimeFormat(interfaceFormattingLocale(language), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(startsAt);

  return (
    <aside className={styles.banner} aria-label={copy.noticeTitle}>
      <span className={styles.bannerIcon} aria-hidden="true"><CalendarClock size={21} /></span>
      <div className={styles.message} role="status">
        <h2>{copy.noticeTitle}</h2>
        <p>{formatUiMessage(copy.noticeTiming, { start })}</p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={actions.secondary} onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(dismissalKey, token);
          } catch {
            // The notice remains dismissed for this mount.
          }
        }}>{copy.dismiss}</button>
      </div>
    </aside>
  );
}

export function MaintenanceOrReleaseBanner({ language }: { language: OnboardingLanguage }) {
  const notice = useMaintenanceNotice();
  if (!notice) return <ReleaseBanner language={language} />;

  const identity = `${notice.id}:${notice.revision}`;
  return <Notice key={identity} language={language} identity={identity} startsAt={notice.startsAt} expiresAt={notice.expiresAt} />;
}
