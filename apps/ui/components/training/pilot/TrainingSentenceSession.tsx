"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { PlatformTranslationExerciseCandidateV2, PlatformTranslationExerciseSessionV2, PlatformTrainingExerciseReviewResultV2 } from "../../../../../packages/shared/types/platformV2";
import type { SentenceExerciseContent } from "@/lib/training/sentenceExerciseContent";
import { loadSentenceExerciseContent, prepareSentenceExerciseTranslation } from "@/lib/training/sentenceExerciseLoader";
import { fetchNextPlatformV2TranslationTrainingSessionExercise, markPlatformV2TranslationTrainingSessionMemberUnavailable, performPlatformV2TranslationExerciseAction } from "@/lib/platform/platformV2TranslationExerciseClient";
import { buildSentenceCardPresentation } from "@/lib/training/sentenceCardPresentation";
import { TrainingSessionV2Layout } from "../v2/TrainingSessionV2Layout";
import { TrainingSessionNotice } from "../v2/TrainingSessionSurface";
import { TrainingSessionChrome } from "../v2/TrainingSessionChrome";
import { TrainingSessionStatsFooter } from "../TrainingSessionStatsFooter";
import { useTranslationTrainingStats } from "./useTranslationTrainingStats";
import { useTrainingExclusion } from "../v2/useTrainingExclusion";
import { trainingExclusionCopy, TrainingExcludeAction } from "../v2/TrainingExcludeAction";
import { TrainingExerciseCard } from "../v2/TrainingExerciseCard";
import { TrainingCardSecondaryActions } from "../v2/TrainingCardTemplates";
import { SenseCardReportAction } from "@/components/feedback/SenseCardReportSheet";
import { freezeSenseCardDiagnosticSnapshot } from "@/lib/feedback/diagnosticReportClient";
import { resolvePlatformV2Audio } from "@/lib/platform/platformV2TrainingMediaClient";

type Props = {
  userId: string;
  session: PlatformTranslationExerciseSessionV2;
  contentLanguageCode: string;
  translationTargetLanguageCode: string;
  interfaceLanguage: OnboardingLanguage;
  onExit: () => void;
  onSessionSuperseded?: () => void;
  onHistory?: () => void;
  onPlayResolvedAudio?: (url: string, label: string) => void;
  onOpenDetails?: (details: { group: SentenceExerciseContent["group"]; entry: SentenceExerciseContent["entry"] }) => void;
};
const copy = {
  en: { title: "Example sentence training", back: "Back to setup", loading: "Preparing the next sentence…", empty: "No translated examples match this selection.", complete: "Sentence session complete", failed: "The next sentence could not be prepared.", retry: "Try again" },
  nl: { title: "Voorbeeldzinnen trainen", back: "Terug naar instellen", loading: "De volgende zin wordt voorbereid…", empty: "Geen vertaalde voorbeelden passen bij deze selectie.", complete: "Sessie voorbeeldzinnen afgerond", failed: "De volgende zin kon niet worden voorbereid.", retry: "Opnieuw proberen" },
  ru: { title: "Тренировка примеров", back: "Назад к настройкам", loading: "Готовим следующее предложение…", empty: "Нет переведённых примеров по этому выбору.", complete: "Тренировка предложений завершена", failed: "Не удалось подготовить следующее предложение.", retry: "Повторить" },
} satisfies Record<OnboardingLanguage, Record<string, string>>;

export function TrainingSentenceSession(props: Props) {
  const { userId, session, contentLanguageCode, translationTargetLanguageCode, interfaceLanguage, onExit, onSessionSuperseded, onHistory, onPlayResolvedAudio, onOpenDetails } = props;
  const t = copy[interfaceLanguage];
  const [candidate, setCandidate] = useState<(PlatformTranslationExerciseCandidateV2 & { ordinal: number }) | null>(null);
  const [content, setContent] = useState<SentenceExerciseContent | null>(null);
  const [completed, setCompleted] = useState(session.completedActions);
  const completedRef = useRef(session.completedActions);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [terminal, setTerminal] = useState<"complete" | "empty" | null>(session.plannedTotal === 0 ? "empty" : null);
  const eventId = useRef<string | null>(null);
  const generation = useRef(0);
  const preparedMembers = useRef(new Set<string>());
  const stats = useTranslationTrainingStats(session.sessionId, completed);

  const loadNext = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setFailed(false); setTerminal(null); setCandidate(null); setContent(null); setRevealed(false);
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        const next = await fetchNextPlatformV2TranslationTrainingSessionExercise(userId, session.sessionId);
        if (current !== generation.current) return;
        if (next.status === "ready") {
          const loaded = await loadSentenceExerciseContent({ candidate: next, contentLanguageCode, translationTargetLanguageCode });
          if (current !== generation.current) return;
          if (loaded.state === "ready") { setCandidate(next); setContent(loaded.content); return; }
          if (loaded.state === "translation-pending" || loaded.state === "translation-unavailable") { setFailed(true); return; }
          await markPlatformV2TranslationTrainingSessionMemberUnavailable(userId, session.sessionId, next.targetId, loaded.state);
          continue;
        }
        if (next.status === "unavailable") {
          await markPlatformV2TranslationTrainingSessionMemberUnavailable(userId, session.sessionId, next.targetId, next.reason);
          continue;
        }
        if (next.status === "completed" || next.status === "exhausted") { setTerminal(completedRef.current ? "complete" : "empty"); return; }
        if (next.status === "superseded") { onSessionSuperseded?.(); return; }
        setFailed(true); return;
      }
      setFailed(true);
    } catch { if (current === generation.current) setFailed(true); }
    finally { if (current === generation.current) setLoading(false); }
  }, [userId, session.sessionId, contentLanguageCode, translationTargetLanguageCode, onSessionSuperseded]);
  useEffect(() => {
    const generationRef = generation;
    void loadNext();
    return () => { generationRef.current++; };
  }, [loadNext]);

  useEffect(() => {
    if (!candidate || !content || loading || terminal) return;
    const nextMember = session.members.find(
      (member) =>
        member.ordinal > candidate.ordinal &&
        member.consumedAt === null &&
        member.unavailableAt === null,
    );
    if (!nextMember) return;
    const key = [
      session.sessionId,
      session.runGeneration ?? "superseded",
      nextMember.targetId,
      translationTargetLanguageCode,
    ].join(":");
    if (preparedMembers.current.has(key)) return;
    preparedMembers.current.add(key);
    const controller = new AbortController();
    void prepareSentenceExerciseTranslation({
      entryId: nextMember.entryId,
      contentNodeId: nextMember.contentNodeId,
      contentLanguageCode,
      translationTargetLanguageCode,
      signal: controller.signal,
    }).catch(() => {
      // Speculative work never changes the visible card. A later authoritative
      // load remains retryable, while this run avoids a background retry loop.
    });
    return () => controller.abort();
  }, [candidate, content, loading, terminal, session.members, session.runGeneration, session.sessionId, contentLanguageCode, translationTargetLanguageCode]);

  const exclusion = useTrainingExclusion({ userId, onSessionSuperseded: onSessionSuperseded ?? onExit, identity: candidate?.targetKey ?? "none", sessionId: session.sessionId, target: { kind: "exercise", targetId: candidate?.targetId ?? "" }, onAccepted: async () => { completedRef.current++; setCompleted(completedRef.current); await loadNext(); } });
  async function grade(result: PlatformTrainingExerciseReviewResultV2) {
    if (!candidate || !content || submitting || exclusion.busy) return;
    setSubmitting(true); setFailed(false);
    try {
      const clientEventId = eventId.current ?? crypto.randomUUID(); eventId.current = clientEventId;
      await performPlatformV2TranslationExerciseAction({ trainingSessionId: session.sessionId, clientEventId, candidate, reviewResult: result });
      eventId.current = null; completedRef.current++; setCompleted(completedRef.current); await loadNext();
    } catch { setFailed(true); } finally { setSubmitting(false); }
  }
  const presentation = content ? buildSentenceCardPresentation({ content, interfaceLanguage, translationTargetLanguageCode, repeatCount: candidate?.state?.seenCount ?? 0 }) : null;
  return <TrainingSessionV2Layout phase={loading ? "loading" : failed && !candidate ? "failure" : "ready"}
    chrome={<TrainingSessionChrome interfaceLanguage={interfaceLanguage} scenario="idiom" mode="word-to-definition" cardFilter="both" sessionName={t.title} presentation={{ kind: "planned", position: Math.min(completed, session.requestedTotal), total: session.requestedTotal, fraction: session.requestedTotal ? Math.min(completed / session.requestedTotal, 1) : 0 }} onHistory={onHistory} onClose={onExit} disabled={submitting || exclusion.busy} />}
    notice={failed || exclusion.failed ? <TrainingSessionNotice notice={{ kind: "error", message: exclusion.failed ? trainingExclusionCopy[interfaceLanguage].failed : t.failed, retryLabel: t.retry, retryDisabled: submitting || loading, onRetry: () => exclusion.failed ? void exclusion.exclude() : void loadNext() }} /> : null}
    footer={<TrainingSessionStatsFooter {...stats} interfaceLanguage={interfaceLanguage} />}>
    {loading ? <div role="status" className="grid h-full min-h-0 place-items-center rounded-3xl border border-slate-300 bg-slate-50 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">{t.loading}</div> : null}
    {!loading && terminal ? <div role="status" className="grid h-full min-h-0 place-items-center rounded-3xl border border-slate-300 bg-slate-50 px-6 text-center dark:border-slate-700 dark:bg-slate-900/50"><div><h1 className="text-2xl font-semibold text-slate-950 dark:text-white">{terminal === "complete" ? t.complete : t.empty}</h1><button type="button" onClick={onExit} className="mt-5 rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white">{t.back}</button></div></div> : null}
    {!loading && !terminal && candidate && content && presentation ? <TrainingExerciseCard key={`${session.sessionId}:${candidate.targetKey}`} presentation={presentation} interfaceLanguage={interfaceLanguage} revealed={revealed} onReveal={() => setRevealed(true)} busy={submitting || exclusion.busy || exclusion.failed} onGrade={(result) => void grade(result)} onPlayAudio={content.group.header.audio && onPlayResolvedAudio ? () => { void resolvePlatformV2Audio({ cacheOwnerId: userId, capability: content.group.header.audio!, text: content.sentence.text }).then((url) => onPlayResolvedAudio(url, content.sentence.text)).catch(() => setFailed(true)); } : undefined} onOpenDetails={onOpenDetails ? () => onOpenDetails({ group: content.group, entry: content.entry }) : undefined} secondaryActions={<TrainingCardSecondaryActions>{content.entry.reportContentRevision && content.entry.capabilities?.some((cap) => cap.actionId === "report-content") ? <SenseCardReportAction appearance="training-text" snapshot={freezeSenseCardDiagnosticSnapshot({ route: "training", group: content.group, entry: content.entry, target: { kind: "content-node", entryId: content.entry.entryId, contentNodeId: content.sentence.contentNodeId, nodeKind: "example", sourceTextFingerprint: content.sentence.sourceTextFingerprint } })} interfaceLanguage={interfaceLanguage} disabled={submitting || exclusion.busy} /> : <span />}{candidate ? <TrainingExcludeAction language={interfaceLanguage} disabled={submitting || exclusion.busy} onClick={() => void exclusion.exclude()} /> : null}</TrainingCardSecondaryActions>} /> : null}
  </TrainingSessionV2Layout>;
}
