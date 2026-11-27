"use client";

import React, { useEffect, useRef, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { ActionButton } from "@/components/practice/ui/ActionButton";
import { IconAction } from "@/components/practice/ui/IconAction";
import { getInterfaceCatalog } from "@/lib/i18n/catalog";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  assistantFeedbackReasons,
  type AssistantFeedbackJourney,
  type AssistantFeedbackReason,
  type AssistantFeedbackVote,
} from "@/lib/platform/assistantFeedbackContract";
import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";
import s from "./assistantReplyFeedback.module.css";

export function AssistantReplyFeedback({
  replyRef, journey, locale, question, answer, savedVote, onVoted,
}: {
  replyRef: string;
  journey: AssistantFeedbackJourney;
  locale: OnboardingLanguage;
  question: string;
  answer: string;
  savedVote?: AssistantFeedbackVote;
  onVoted: (vote: AssistantFeedbackVote) => void;
}) {
  const catalog = getInterfaceCatalog(locale);
  const t = catalog.features.personalAssistant.feedback;
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState<AssistantFeedbackReason>();
  const [comment, setComment] = useState("");
  const [includeExcerpt, setIncludeExcerpt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const detailsForm = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (formOpen) detailsForm.current?.scrollIntoView({ block: "nearest" });
  }, [formOpen]);

  async function send(vote: AssistantFeedbackVote, details = false) {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/library/card-assistant/feedback", {
        method: "POST",
        headers: await authenticatedJsonHeaders(),
        body: JSON.stringify({
          vote, replyRef,
          ...(details ? { reason, comment } : {}),
          ...(details && includeExcerpt ? { includeExcerpt: true, question, answer } : {}),
        }),
      });
      if (!response.ok) throw new Error("feedback_failed");
      onVoted(vote);
      if (details || vote === "up") setFormOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function rate(vote: AssistantFeedbackVote) {
    setFormOpen(vote === "down");
    if (vote === savedVote) return;
    setReason(undefined);
    setComment("");
    setIncludeExcerpt(false);
    void send(vote);
  }

  return (
    <div className={s.feedback}>
      <div className={s.rating}>
        <span>{t.prompt}</span>
        <IconAction className={s.vote} label={t.up} title={t.up}
          aria-pressed={savedVote === "up"} disabled={busy} onClick={() => rate("up")}>
          <ThumbsUp size={15} strokeWidth={1.6} aria-hidden="true" />
        </IconAction>
        <IconAction className={s.vote} label={t.down} title={t.down}
          aria-pressed={savedVote === "down"} disabled={busy} onClick={() => rate("down")}>
          <ThumbsDown size={15} strokeWidth={1.6} aria-hidden="true" />
        </IconAction>
        {savedVote && !formOpen && <span role="status">{t.thanks}</span>}
      </div>
      {formOpen && (
        <form ref={detailsForm} className={s.details} onSubmit={event => { event.preventDefault(); void send("down", true); }}>
          <fieldset disabled={busy}>
            <legend>{t.details}</legend>
            <div className={s.reasons}>
              {assistantFeedbackReasons[journey].map(item => (
                <button type="button" key={item} aria-pressed={reason === item}
                  onClick={() => setReason(reason === item ? undefined : item)}>{t[item]}</button>
              ))}
            </div>
            <textarea className={s.comment} rows={2} maxLength={1000}
              aria-label={t.comment} placeholder={t.comment} value={comment}
              onChange={event => setComment(event.target.value)} />
            <label className={s.consent}>
              <input type="checkbox" checked={includeExcerpt} onChange={event => setIncludeExcerpt(event.target.checked)} />
              <span>{t.includeExcerpt}</span>
            </label>
            {includeExcerpt && (
              <dl className={s.preview}>
                <dt>{t.excerptQuestion}</dt><dd>{question}</dd>
                <dt>{t.excerptAnswer}</dt><dd>{answer}</dd>
              </dl>
            )}
            <div className={s.actions}>
              <ActionButton onClick={() => setFormOpen(false)}>{catalog.common.close}</ActionButton>
              <ActionButton type="submit" variant="primary">{t.submit}</ActionButton>
            </div>
          </fieldset>
        </form>
      )}
      {failed && <p className={s.failed} role="alert">{t.failed}</p>}
    </div>
  );
}
