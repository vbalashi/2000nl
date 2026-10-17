"use client";
import React, { useEffect } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { releaseCopy } from "@/lib/releases/releaseCopy";
import {
  SettingsPanel,
  SettingsRow,
} from "@/components/practice/settings/SettingsLayout";
import { useReleaseUpdates } from "./AppReleaseContext";
import s from "./ReleaseUpdates.module.css";
export function ReleaseDot({ gear = false }: { gear?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-testid="release-dot"
      className={`${s.dot} ${gear ? s.gearDot : ""}`}
    />
  );
}
function Details({ language }: { language: OnboardingLanguage }) {
  const state = useReleaseUpdates();
  const url = state?.release?.announcement?.detailsUrl;
  return url ? (
    <a className={s.link} href={url} target="_blank" rel="noopener noreferrer">
      {releaseCopy(language).more} ↗
    </a>
  ) : null;
}
export function ReleaseBanner({ language }: { language: OnboardingLanguage }) {
  const state = useReleaseUpdates();
  const c = releaseCopy(language);
  if (!state?.banner) return null;
  const news = state.release?.announcement;
  return (
    <aside className={s.banner} aria-label={c.updates}>
      <div className={s.message}>
        <h2>{c.available}</h2>
        <p lang={news?.locale}>
          {news ? `${news.title}. ${news.summary}` : c.summary}
        </p>
      </div>
      <div className={s.actions}>
        <Details language={language} />
        <button
          type="button"
          className={s.primary}
          disabled={state.status === "updating"}
          onClick={() => void state.update()}
        >
          {state.status === "updating" ? c.updating : c.update}
        </button>
        <button className={s.secondary} type="button" onClick={state.dismiss}>
          {c.later}
        </button>
      </div>
      {(state.status === "failed" || state.status === "worker") && (
        <p role="status">{state.status === "worker" ? c.worker : c.failed}</p>
      )}
    </aside>
  );
}
export function ReleaseUpdatesSection({
  language,
  visible = true,
}: {
  language: OnboardingLanguage;
  visible?: boolean;
}) {
  const state = useReleaseUpdates();
  const c = releaseCopy(language);
  const markRead = state?.markRead;
  useEffect(() => {
    if (visible) markRead?.();
  }, [visible, markRead]);
  if (!state) return null;
  const news = state.release?.announcement;
  const format = (value: string) =>
    Number.isFinite(Date.parse(value))
      ? new Date(value).toLocaleDateString(language, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "—";
  const status = state.development
    ? c.dev
    : state.status === "checking"
      ? c.checking
      : state.status === "updating"
        ? c.updating
        : state.status === "unknown"
          ? c.unknown
          : state.status === "worker"
            ? c.worker
            : state.status === "failed"
              ? c.failed
              : state.unsafe && state.updateAvailable
                ? c.deferred
                : state.status === "updated"
                  ? c.updated
                  : state.updateAvailable
                    ? c.available
                    : c.current;
  return (
    <SettingsPanel title={c.updates}>
      <p role="status" className={s.status}>
        {status}
      </p>
      {news && (
        <article className={s.news} lang={news.locale}>
          <h3>{news.title}</h3>
          <p>{news.summary}</p>
        </article>
      )}
      <div className={s.actions}>
        <Details language={language} />
        {state.updateAvailable && (
          <button
            className={s.primary}
            type="button"
            disabled={state.unsafe || state.status === "updating"}
            onClick={() => void state.update()}
          >
            {state.status === "updating" ? c.updating : c.update}
          </button>
        )}
      </div>
      <SettingsRow className={s.metadata} title={c.installed}>
        <span>{state.installed.version}</span>
      </SettingsRow>
      <SettingsRow className={s.metadata} title={c.built}>
        <span>{format(state.installed.buildTimestamp)}</span>
      </SettingsRow>
      {state.updateAvailable && (
        <SettingsRow className={s.metadata} title={c.latest}>
          <span>{state.release?.build.version}</span>
        </SettingsRow>
      )}
      {news && (
        <SettingsRow className={s.metadata} title={c.released}>
          <span>{format(news.publishedAt)}</span>
        </SettingsRow>
      )}
      <div className={s.actions}>
        <button
          className={s.link}
          type="button"
          disabled={state.status === "checking" || state.status === "updating"}
          onClick={() => void state.check()}
        >
          {c.check}
        </button>
      </div>
    </SettingsPanel>
  );
}
