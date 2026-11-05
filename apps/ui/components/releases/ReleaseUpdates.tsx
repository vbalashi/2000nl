"use client";
import React, { useEffect } from "react";
import { RefreshCw, ArrowUpRight, Check, AlertCircle } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { ReleaseHistoryEntry } from "@/lib/releases/appRelease";
import { releaseCopy } from "@/lib/releases/releaseCopy";
import { SettingsPanel } from "@/components/practice/settings/SettingsLayout";
import { useReleaseUpdates } from "./AppReleaseContext";
import actions from "@/components/practice/ui/launchAction.module.css";
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
      {releaseCopy(language).more} <ArrowUpRight size={15} aria-hidden="true" />
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
      <span className={s.bannerIcon} aria-hidden="true">
        <RefreshCw size={21} strokeWidth={1.7} />
      </span>
      <div className={s.message}>
        <h2>
          {c.available} <span>{state.release?.build.version}</span>
        </h2>
        <p lang={news?.locale}>{news ? news.summary : c.summary}</p>
      </div>
      <div className={`${s.actions} ${s.bannerActions}`}>
        <Details language={language} />
        <button
          type="button"
          className={actions.primary}
          disabled={state.status === "updating"}
          onClick={() => void state.update()}
        >
          <RefreshCw
            size={16}
            strokeWidth={1.8}
            aria-hidden="true"
            className={state.status === "updating" ? s.spinning : undefined}
          />
          {state.status === "updating" ? c.updating : c.update}
        </button>
        <button
          className={actions.secondary}
          type="button"
          onClick={state.dismiss}
        >
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
  const problem =
    state.status === "unknown" ||
    state.status === "failed" ||
    state.status === "worker";
  const StatusIcon = problem
    ? AlertCircle
    : state.updateAvailable
      ? RefreshCw
      : Check;
  const version = state.updateAvailable
    ? state.release?.build.version
    : state.installed.version;
  return (
    <SettingsPanel title={c.about} className={s.panel}>
      <section className={s.hero} aria-label={c.updates}>
        <span className={s.heroIcon} aria-hidden="true">
          <StatusIcon size={28} strokeWidth={1.6} />
        </span>
        <div className={s.heroContent}>
          <span className={s.eyebrow}>
            {c.version} {version}
          </span>
          <h3 role="status">{status}</h3>
          {!problem && !state.development && (
            <p>{state.updateAvailable ? c.updateHint : c.currentHint}</p>
          )}
          <div className={s.actions}>
            {state.updateAvailable ? (
              <button
                className={actions.primary}
                type="button"
                disabled={state.unsafe || state.status === "updating"}
                onClick={() => void state.update()}
              >
                <RefreshCw
                  size={16}
                  strokeWidth={1.8}
                  aria-hidden="true"
                  className={
                    state.status === "updating" ? s.spinning : undefined
                  }
                />
                {state.status === "updating" ? c.updating : c.update}
              </button>
            ) : (
              <button
                className={actions.secondary}
                type="button"
                disabled={
                  state.status === "checking" || state.status === "updating"
                }
                onClick={() => void state.check()}
              >
                <RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" />
                {c.check}
              </button>
            )}
          </div>
        </div>
      </section>
      {Boolean(state.release?.history?.length) ? (
        <ReleaseHistory items={state.release!.history!} language={language} />
      ) : state.release?.historyStatus === "unavailable" ? (
        <p role="status" className={s.historyNotice}>
          {c.historyUnavailable}
        </p>
      ) : news ? (
        <section className={s.newsSection} aria-label={c.whatsNew}>
          <div className={s.sectionHeading}>
            <h3>{c.whatsNew}</h3>
            <time dateTime={news.publishedAt}>{format(news.publishedAt)}</time>
          </div>
          <article className={s.news} lang={news.locale}>
            <h4>{news.title}</h4>
            <p>{news.summary}</p>
            <Details language={language} />
          </article>
        </section>
      ) : state.release?.historyStatus === "ready" ? (
        <p className={s.historyNotice}>{c.noHistory}</p>
      ) : null}
      <footer className={s.buildInfo}>
        <span>
          {c.installed} <strong>{state.installed.version}</strong>
        </span>
        <span>
          {c.built} {format(state.installed.buildTimestamp)}
        </span>
        {state.updateAvailable && (
          <button
            className={s.link}
            type="button"
            disabled={
              state.status === "checking" || state.status === "updating"
            }
            onClick={() => void state.check()}
          >
            {c.check}
          </button>
        )}
      </footer>
    </SettingsPanel>
  );
}

export const releaseHistoryUrl = (
  language: OnboardingLanguage,
  version?: string,
) => `/updates?language=${language}${version ? `#v${version}` : ""}`;
export function ReleaseHistory({
  items,
  language,
  full = false,
}: {
  items: ReleaseHistoryEntry[];
  language: OnboardingLanguage;
  full?: boolean;
}) {
  const c = releaseCopy(language);
  const SectionHeading = full ? "h2" : "h3",
    ArticleHeading = full ? "h3" : "h4";
  return (
    <section
      className={s.newsSection}
      aria-label={full ? c.allUpdates : c.history}
    >
      <div className={s.sectionHeading}>
        <SectionHeading>{full ? c.allUpdates : c.history}</SectionHeading>
      </div>
      <div className={s.historyList}>
        {items.map((item) => (
          <article
            key={item.version}
            id={`v${item.version}`}
            className={s.news}
            lang={item.locale}
          >
            <div className={s.historyMeta}>
              <strong>
                {c.version} {item.version}
              </strong>
              <time dateTime={item.publishedAt}>
                {new Date(item.publishedAt).toLocaleDateString(language, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </div>
            <ArticleHeading>{item.title}</ArticleHeading>
            <p>{item.summary}</p>
            {full
              ? item.details
                  .split(/\n\n+/)
                  .filter(Boolean)
                  .map((paragraph, index) => <p key={index}>{paragraph}</p>)
              : item.details &&
                !item.detailsUrl && (
                  <a
                    className={s.link}
                    href={releaseHistoryUrl(language, item.version)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {c.more}
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                )}
            {item.detailsUrl && (
              <a
                className={s.link}
                href={item.detailsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {c.more}
                <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            )}
          </article>
        ))}
      </div>
      {!full && (
        <a
          className={s.link}
          href={releaseHistoryUrl(language)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {c.allUpdates}
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      )}
    </section>
  );
}
