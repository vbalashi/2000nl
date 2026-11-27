"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowRight,
  FilePenLine,
  Check,
  ChevronDown,
  ChevronUp,
  Mic,
  Link2,
  List,
  Quote,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { ActionButton } from "@/components/practice/ui/ActionButton";
import { ActionMenu } from "@/components/practice/ui/ActionMenu";
import { IconAction } from "@/components/practice/ui/IconAction";
import { DictationWaveform } from "@/lib/audio/DictationWaveform";
import { useAzureDictation } from "@/lib/audio/useAzureDictation";
import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";
import {
  assistantLabels,
  type SourceHit,
  type AssistantTurn,
  type AssistantArticle,
  type Suggestion,
  type AssistantReply,
} from "@/lib/platform/personalCardAssistantContract";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { allowanceOperationHeader, type AssistantAllowanceKind, type AssistantAllowances } from "@/lib/platform/assistantAllowanceContract";
import { formatUiMessage, getPartOfSpeechLabel } from "@/lib/uiMessages";
import {saveSearchChat,type SearchChat} from "./lastSearchChat";
import { getInterfaceCatalog } from "@/lib/i18n/catalog";
import {searchRecoveryCopy} from "./searchRecoveryCopy";
import { AssistantReplyFeedback } from "./AssistantReplyFeedback";
import {
  assistantFeedbackAnswerLimit,
  assistantFeedbackHistoryLimit,
  assistantFeedbackQuestionLimit,
} from "@/lib/platform/assistantFeedbackContract";
import type { AssistantFeedbackVote } from "@/lib/platform/assistantFeedbackContract";
import reading from "@/components/practice/article/articleContent.module.css";
import s from "./personalCardAssistant.module.css";
export type { Suggestion } from "@/lib/platform/personalCardAssistantContract";
type Props = {
  discovery?: {chat:SearchChat;storageKey:string; startSearch:boolean; category:string; scope:string; onClear:()=>void; onSelect:(hit:SourceHit)=>void; onDraft:(snapshot:AssistantSnapshot)=>void};
  word: string;
  definition: string;
  languageCode: string;
  interfaceLanguage: OnboardingLanguage;
  senseKey: string;
  ordinal: number;
  article?: AssistantArticle;
  session?: AssistantSession;
  onClose: () => void;
  allowances?: AssistantAllowances | null;
  onAllowancesChanged?: () => void;
  onPremiumRequired?: (opener?: HTMLElement, feature?: AssistantAllowanceKind) => void;
  requestReply?: (request: RequestInit) => Promise<Response>;
  onApply: (suggestions: Suggestion[], senseKey: string) => void;
};
type Exchange = {
  question: string;
  intent?: string;
  reply?: AssistantReply;
  error?: boolean;
  alreadyProcessed?: boolean;
  retryOperationId?: string;
  applied?: number[];
  feedbackVote?: AssistantFeedbackVote;
};
export type AssistantSnapshot = {turns:Exchange[];draft:string;intent?:string;searchTurnCount?:number};
export type AssistantSession = Map<string,AssistantSnapshot>;
function AssistantMessage({ message, terms }: { message: string; terms: string[] }) {
  const keyTerms = [...new Set(terms)]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .map(term => term.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&"));
  const emphasis = "\\*\\*[^*\\r\\n]+\\*\\*";
  const lexical = keyTerms.length
    ? "|(?<![\\p{L}\\p{N}])(?:" + keyTerms.join("|") + ")(?![\\p{L}\\p{N}])"
    : "";
  const spans = message.split(new RegExp("(" + emphasis + lexical + ")", "giu"));
  return <p>{spans.map((text, index) => index % 2
    ? <strong className={s.keyword} key={index}>{text.startsWith("**") ? text.slice(2, -2) : text}</strong>
    : text)}</p>;
}
export function PersonalCardAssistant(props: Props) {
  return <Conversation key={props.senseKey} {...props} />;
}
function Conversation({
  word,
  definition,
  languageCode,
  interfaceLanguage,
  senseKey,
  ordinal,
  article,
  session,
  onClose,
  onApply,
  discovery,
  allowances,
  onAllowancesChanged,
  onPremiumRequired,
  requestReply,
}: Props) {
  const t = assistantLabels(interfaceLanguage);
  const recovery = searchRecoveryCopy(interfaceLanguage);
  const context = article ?? {
    partOfSpeech: null,
    senses: [{ definition, fields: [] }],
  };
  const restored = discovery?.chat ?? session?.get(senseKey);
  const free = allowances?.premium === false ? allowances : null;
  const discoveryPrompt = discovery?.startSearch && word ? recovery.prompt + " «" + word + "»" : null;
  const [turns, setTurns] = useState<Exchange[]>(restored?.turns ?? []),
    [draft, setDraft] = useState(restored?.draft || (free ? discoveryPrompt ?? "" : "")),
    [draftIntent, setDraftIntent] = useState(restored?.intent),
    [pending, setPending] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [searchTurnCount] = useState(restored?.searchTurnCount ?? 0);
  const catalog = getInterfaceCatalog(interfaceLanguage);
  const speech = catalog.features.dictation;
  const payment = catalog.ui.settings.premiumOffer;
  const readNumber = new Intl.NumberFormat(interfaceLanguage);
  const openPremium = (feature: AssistantAllowanceKind = "ai_reply") =>
    onPremiumRequired?.(document.activeElement instanceof HTMLElement ? document.activeElement : undefined, feature);
  const mic = useAzureDictation((text) => {
    setDraftIntent(undefined);
    setDraft(current => (current + (!current || /\s$/.test(current) ? "" : " ") + text).slice(0, 1500));
    onAllowancesChanged?.();
  }, () => {
    onAllowancesChanged?.();
    openPremium("dictation");
  });
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const history = useRef<HTMLDivElement>(null),
    list = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null),
    follow = useRef(true);
  const searchStorageKey = discovery?.storageKey;
  const searchChat = discovery?.chat;
  useEffect(() => {
    const completed = turns.filter((turn) => turn.reply || turn.error);
    // Closing the panel cancels the request. Keep its unanswered question in the composer.
    const snapshot = {
      turns: completed,
      searchTurnCount,
      intent: draft ? draftIntent : completed.length < turns.length ? turns.at(-1)?.intent : undefined,
      draft:
        draft ||
        (completed.length < turns.length
          ? turns[turns.length - 1].question
          : ""),
    };
    session?.set(senseKey,snapshot);
    if (searchStorageKey && searchChat) saveSearchChat(searchStorageKey,searchChat,snapshot);
  }, [session, senseKey, turns, draft, draftIntent, searchTurnCount, searchStorageKey, searchChat]);
  const updateEdges = () => {
    const h = history.current;
    if (h)
      setEdges({
        top: h.scrollTop > 4,
        bottom: h.scrollHeight - h.clientHeight - h.scrollTop > 4,
      });
  };
  useEffect(() => {
    const observer = new ResizeObserver(updateEdges);
    if (history.current) observer.observe(history.current);
    if (list.current) observer.observe(list.current);
    return () => {
      observer.disconnect();
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    const h = history.current;
    if (h && follow.current) h.scrollTop = h.scrollHeight;
    updateEdges();
  }, [turns, pending]);
  useEffect(() => {
    const input = composer.current;
    if (input) {
      input.style.height = "auto";
      input.style.height = input.scrollHeight + "px";
    }
  }, [draft]);
  const ask = async (value: string, intent?: string, retry = false) => {
    const question = value.trim();
    if (!question || request.current || mic.status !== "idle") return;
    if (free?.aiRepliesRemaining === 0) {
      openPremium();
      return;
    }
    const operation = (retry && turns.at(-1)?.retryOperationId) || crypto.randomUUID();
    let responseUncertain = false;
    const controller = new AbortController();
    request.current = controller;
    follow.current = true;
    const conversation: AssistantTurn[] = turns.flatMap(
      (turn): AssistantTurn[] =>
        turn.reply
          ? [
              { role: "user", text: turn.question },
              {
                role: "assistant",
                text: [
                  turn.reply.message,
                  ...turn.reply.suggestions.map((p) => p.text),
                ].join("\n"),
              },
            ]
          : [],
    );
    setTurns((old) => [...(retry ? old.slice(0, -1) : old), { question, intent }]);
    setAnchor(null);
    if (!retry) {
      setDraft("");
      setDraftIntent(undefined);
    }
    setPending(true);
    try {
      const headers = new Headers(requestReply ? undefined : await authenticatedJsonHeaders());
      headers.set(allowanceOperationHeader, operation);
      const init = {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          word:discovery && !word ? question.slice(0,300) : word,
          definition,
          article: context,
          selectedOrdinal: ordinal,
          question,
          languageCode,
          interfaceLanguage,
          intent: discovery ? intent ?? "find-meaning" : intent,
          searchCategory:discovery?.category,
          searchScope:discovery?.scope,
          history: conversation
            .slice(-8)
            .map((t) => ({ ...t, text: t.text.slice(0, 1500) })),
        }),
      } satisfies RequestInit;
      responseUncertain = true;
      const response = requestReply ? await requestReply(init) : await fetch("/api/library/card-assistant", init);
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        if (error?.error === "assistant_operation_already_used") {
          setTurns(old => old.map((turn, i) => i === old.length - 1
            ? { ...turn, error: true, alreadyProcessed: true } : turn));
          onAllowancesChanged?.();
          return;
        }
        responseUncertain = error?.error === "assistant_operation_unconfirmed";
        if (error?.error === "assistant_allowance_exhausted") {
          setTurns(old => old.slice(0, -1));
          setDraft(question);
          setDraftIntent(intent);
          onAllowancesChanged?.();
          openPremium();
          return;
        }
        throw new Error("request_failed");
      }
      const reply: AssistantReply = await response.json();
      responseUncertain = false;
      onAllowancesChanged?.();
      setTurns((old) =>
        old.map((turn, i) =>
          i === old.length - 1 ? { ...turn, reply } : turn,
        ),
      );
    } catch {
      if (!controller.signal.aborted)
        setTurns((old) =>
          old.map((turn, i) =>
            i === old.length - 1 ? { ...turn, error: true, retryOperationId: responseUncertain ? operation : undefined } : turn,
          ),
        );
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  };
  const initialSearch = useRef(free ? null : discoveryPrompt);
  const sendInitial = useRef(ask);
  sendInitial.current = ask;
  useEffect(() => {
    if (!initialSearch.current) return;
    const timer = window.setTimeout(() => { void sendInitial.current(initialSearch.current!); },0);
    return () => window.clearTimeout(timer);
  }, []);
  const currentExamples = context.senses[ordinal - 1]?.fields.filter(field => field.kind === "example") ?? [];
  function canApply(turn: Exchange, proposal: Suggestion, index: number) {
    return !turn.applied?.includes(index) &&
      (proposal.kind !== "headword" || !word.trim()) &&
      (!proposal.replaces || currentExamples[proposal.replaces.ordinal - 1]?.text === proposal.replaces.text);
  }
  function apply(turnIndex: number, indexes: number[]) {
    const turn = turns[turnIndex];
    const proposals = turn.reply?.suggestions ?? [];
    onApply(indexes.map(index => proposals[index]), senseKey);
    setTurns(old => old.map((item, index) => index === turnIndex
      ? { ...item, applied: [...(item.applied ?? []), ...indexes] }
      : item));
  }
  function quote(text: string) {
    const cited = text.slice(0, 1500).split(/\r?\n/).map(line => "> " + line).join("\n");
    setDraft(current => (cited.slice(0, Math.max(0, 1498 - current.length)) + "\n\n" + current).slice(0, 1500));
    setDraftIntent(undefined);
    composer.current?.focus();
    window.requestAnimationFrame(() => {
      const input = composer.current;
      input?.setSelectionRange(input.value.length, input.value.length);
    });
  }
  function scroll(direction: number) {
    const h = history.current;
    h?.scrollBy({
      top: direction * h.clientHeight * 0.8,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  const showStarter = !discovery && turns.length === 0 && !!word.trim();
  const renderedTurns = turns.map((turn, i) => {
    const proposals = discovery ? [] : turn.reply?.suggestions ?? [];
    const applicable = proposals.flatMap((proposal, index) => canApply(turn, proposal, index) ? [index] : []);
    const targets = applicable.map(index => {
      const proposal = proposals[index];
      if (proposal.replaces) return "example:" + proposal.replaces.ordinal;
      return ["headword", "definition", "partOfSpeech"].includes(proposal.kind) ? proposal.kind : index;
    });
    const draftWord = turn.reply?.suggestions.find(proposal => proposal.kind === "headword")?.text;
    const terms = [discovery ? "" : word, draftWord ?? "", ...(turn.reply?.sources ?? []).map(source => source.word)];
    return <div key={i}>
      <p className={s.bubble}>{turn.question}</p>
      {turn.reply && (
        <>
          {turn.reply.mode !== "provider" && (
            <small>
              {turn.reply.mode === "preview"
                ? t.demo
                : turn.reply.mode === "dictionary"
                  ? t.dictionary
                  : null}
            </small>
          )}
          <AssistantMessage message={turn.reply.message} terms={terms} />
          {!!turn.reply.sources?.length && (
            <div className={s.sources}>
              <small>{t.sources}</small>
              {turn.reply.sources.map((hit) => (
                <div key={hit.entryId}>
                  {discovery ? <button type="button" className={s.sourceLink} onClick={()=>discovery.onSelect(hit)}>{hit.word}</button> : <strong>{hit.word}</strong>} · {hit.dictionary}
                  <p lang={languageCode}>{hit.definition}</p>
                  {hit.example && <p lang={languageCode}><i>{hit.example}</i></p>}
                </div>
              ))}
            </div>
          )}
          {discovery && turn.reply.mode === "provider" && !turn.reply.outOfScope && i === turns.length - 1 && (
            turn.reply.cardDraft && turn.reply.suggestions.length > 0
              ? <button type="button" className={s.draftLink}
                  onClick={() => discovery.onDraft({turns, draft: "", searchTurnCount: i})}>
                  <FilePenLine size={16} aria-hidden="true" />
                  <span className={s.draftDestination}>
                    {draftWord && <strong lang={languageCode}>{draftWord}</strong>}
                    <span>{t.openCardDraft}</span>
                  </span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              : <ActionButton variant="primary" disabled={pending || mic.status !== "idle"}
                  onClick={() => void ask(t.draftFromSearch, "draft-from-search")}>{t.draftFromSearch}</ActionButton>
          )}
          {applicable.length > 1 && new Set(targets).size === targets.length && (
            <ActionButton variant="primary" className={s.applyAll} onClick={() => apply(i, applicable)}>{t.applyAll}</ActionButton>
          )}
          {proposals.map((proposal, j) => {
            const text =
              proposal.kind === "partOfSpeech"
                ? (getPartOfSpeechLabel(
                    interfaceLanguage,
                    proposal.text,
                  ) ?? proposal.text)
                : proposal.text;
            const Icon = proposal.kind === "example" ? List
              : proposal.kind === "reference" || proposal.kind === "synonym" ? Link2
              : proposal.kind === "note" || proposal.kind === "expression" ? Quote : null;
            return (
              <section className={s.proposal} key={j}>
                <div className={s.proposalBody}>
                  <h4 className={reading.fieldHeading}>
                    {Icon && <Icon size={12} aria-hidden="true" />}
                    {proposal.kind === "headword" ? catalog.features.personalCard.word : t[proposal.kind]}
                  </h4>
                  <p className={proposal.kind === "example" ? reading.literary : reading.definitionText}
                    lang={proposal.kind === "partOfSpeech" ? interfaceLanguage : languageCode}>
                    {text}
                  </p>
                </div>
                <div className={s.proposalActions}>
                  <button type="button" className={s.inlineAction}
                    disabled={!canApply(turn, proposal, j)} onClick={() => apply(i, [j])}>
                    {turn.applied?.includes(j) ? t.used : proposal.replaces ? t.replaceExample : t.use}
                  </button>
                  <button type="button" className={s.inlineAction}
                    disabled={mic.status !== "idle" || draft.length > 1495} onClick={() => quote(text)}>{t.quote}</button>
                </div>
              </section>
            );
          })}
        </>
      )}
      {turn.reply?.feedback && (
        <AssistantReplyFeedback replyRef={turn.reply.feedback.ref} journey={turn.reply.feedback.journey}
          locale={interfaceLanguage} savedVote={turn.feedbackVote}
          getHistory={() => {
            const exchanges = turns.slice(0, i + 1).flatMap(item => {
              if (!item.reply) return [];
              const answer = [item.reply.message.replace(/\*\*([^*\r\n]+)\*\*/g, "$1"),
                ...(!discovery || item.reply.cardDraft ? item.reply.suggestions.map(proposal => proposal.text) : []),
              ].join("\n\n").trim();
              return [{ question: item.question, answer }];
            });
            const latest = exchanges.slice(-assistantFeedbackHistoryLimit);
            const shortened = latest.length < exchanges.length || latest.some(item =>
              item.question.length > assistantFeedbackQuestionLimit || item.answer.length > assistantFeedbackAnswerLimit);
            const clip = (value: string, limit: number) => value.length <= limit ? value : value.slice(0, limit - 1).trimEnd() + "…";
            return { shortened, exchanges: latest.map(item => ({
              question: clip(item.question, assistantFeedbackQuestionLimit),
              answer: clip(item.answer, assistantFeedbackAnswerLimit),
            })) };
          }}
          onVoted={vote => {
            if (vote === "down") follow.current = false;
            setTurns(old => old.map((item, index) => index === i ? { ...item, feedbackVote: vote } : item));
          }} />
      )}
      {turn.error && (
        <>
          <p role="alert">{turn.alreadyProcessed ? payment.operationAlreadyProcessed : t.error}</p>
          {i === turns.length - 1 && !turn.alreadyProcessed && (
            <ActionButton
              disabled={pending || mic.status !== "idle"}
              onClick={() => void ask(turn.question, turn.intent, true)}
            >
              {catalog.common.retry}
            </ActionButton>
          )}
        </>
      )}
    </div>;
  });
  return (
    <aside
      className={s.panel}
      aria-label={t.title}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !anchor) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className={s.header}>
        <h3>
          <Sparkles size={16} />
          {discovery ? recovery.chat : t.title}
        </h3>
        <div className={s.headerActions}>
          {discovery && (turns.length > 0 || draft) && (
            <button type="button" className={s.inlineAction} disabled={pending} onClick={() => {
              setTurns([]);
              setDraft("");
              setDraftIntent(undefined);
              discovery.onClear();
              composer.current?.focus();
            }}>{recovery.clearChat}</button>
          )}
          <IconAction data-card-header-close label={t.close} onClick={onClose}><X size={17} /></IconAction>
        </div>
      </header>
      <p className={s.context}>
        {discovery ? [word,discovery.scope].filter(Boolean).join(" · ") : <>{word || t.word} · {t.sense} {ordinal} · {definition || t.noDef}</>}
      </p>
      {!discovery && <details className={s.articleContext}>
        <summary>
          {t.context} · {context.senses.length}
        </summary>
        {context.partOfSpeech && (
          <small>
            {getPartOfSpeechLabel(interfaceLanguage, context.partOfSpeech)}
          </small>
        )}
        <ol>
          {context.senses.map((sense, index) => (
            <li
              key={index}
              aria-current={index + 1 === ordinal ? "true" : undefined}
            >
              {index + 1 === ordinal && <small>{t.selected} · </small>}
              {sense.definition || t.noDef}
              {sense.fields.length > 0 && (
                <ul>
                  {sense.fields.map((f, j) => (
                    <li key={j}>
                      <small>{t[f.kind]}</small> {f.text}
                      {f.children?.map((c, k) => (
                        <div key={k}>
                          <small>{t[c.kind]}</small> {c.text}
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </details>}
      <div className={s.viewport}>
        {edges.top && (
          <button
            type="button"
            className={s.up}
            aria-label={t.earlier}
            onClick={() => scroll(-1)}
          >
            <ChevronUp size={15} />
          </button>
        )}
        <div
          ref={history}
          className={s.history}
          role="log"
          aria-label={t.title}
          tabIndex={0}
          onScroll={() => {
            updateEdges();
            const h = history.current;
            if (h)
              follow.current =
                h.scrollHeight - h.clientHeight - h.scrollTop < 12;
          }}
        >
          <div ref={list}>
            {searchTurnCount > 0 && (
              <details className={s.searchHistory}>
                <summary>{t.searchHistory}</summary>
                {renderedTurns.slice(0, searchTurnCount)}
              </details>
            )}
            {renderedTurns.slice(searchTurnCount)}
            {pending && <p role="status">{t.waiting}</p>}
          </div>
        </div>
        {edges.bottom && (
          <button
            type="button"
            className={s.down}
            aria-label={t.later}
            onClick={() => scroll(1)}
          >
            <ChevronDown size={15} />
          </button>
        )}
      </div>
      <form
        className={s.composer}
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft, draftIntent);
        }}
      >
        {free && <div role="status" className={s.allowanceNote}>
          {turns.length === 0 && free.aiRepliesRemaining > 0 && <div>{payment.assistantTrialNote}</div>}
          {formatUiMessage(payment.assistantAllowanceNote, {
            replies: readNumber.format(free.aiRepliesRemaining), dictations: readNumber.format(free.dictationsRemaining),
          })}
        </div>}
        {(mic.issue || mic.status !== "idle") && (
          <small role="status" className={mic.issue ? undefined : "sr-only"}>
            {mic.issue
              ? speech[mic.issue]
              : mic.status !== "idle"
                ? speech[mic.status]
                : ""}
          </small>
        )}
        {showStarter && (
          <ActionButton variant="primary" className={s.starter} disabled={mic.status !== "idle" || !!draft.trim()}
            onClick={() => void ask(t.fill, "fill")}>{t.fill}<ArrowUp size={14} aria-hidden="true" /></ActionButton>
        )}
        <textarea
          ref={composer}
          value={draft}
          maxLength={1500}
          rows={2}
          aria-label={t.type}
          placeholder={showStarter ? t.promptHint : turns.length ? t.followUp : t.type}
          onChange={(e) => {
            setDraft(e.target.value);
            setDraftIntent(undefined);
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void ask(draft, draftIntent);
            }
          }}
        />
        {mic.status !== "idle" ? (
          <footer className={s.recorder}>
            <IconAction
              label={speech.cancel}
              title={speech.cancel}
              onClick={mic.cancel}
            >
              <X size={17} />
            </IconAction>
            {mic.analyser ? (
              <DictationWaveform
                analyser={mic.analyser}
                className={s.waveform}
              />
            ) : (
              <span className={s.meterPending} aria-hidden="true" />
            )}
            <IconAction
              label={speech.stop}
              title={speech.stop}
              disabled={mic.status !== "recording"}
              onClick={() => void mic.toggle()}
            >
              <Check size={17} />
            </IconAction>
          </footer>
        ) : (
          <footer>
            {!discovery && <IconAction
              label={t.scenarios}
              aria-expanded={!!anchor}
              aria-haspopup="menu"
              disabled={pending}
              onClick={(e) => setAnchor(e.currentTarget)}
            >
              <Plus size={17} />
            </IconAction>}
            {anchor && (
              <ActionMenu
                anchor={anchor}
                language={interfaceLanguage}
                title={t.scenarios}
                onClose={() => {
                  setAnchor(null);
                  anchor.focus();
                }}
                items={(
                  [
                    "check",
                    "fill",
                    "example",
                    "synonym",
                    "reference",
                    "expression",
                    "note",
                    "partOfSpeech",
                    "compare",
                    "search",
                    "similar",
                  ] as const
                ).map((key) => ({
                  id: key,
                  label: t[key],
                  disabled: key === "compare" && context.senses.length < 2,
                  onSelect: () => {
                    setDraft(current => (current.trim() ? current.trimEnd() + "\n" + t[key] : t[key]).slice(0, 1500));
                    setDraftIntent(draft.trim() ? undefined : key);
                    setAnchor(null);
                    composer.current?.focus();
                  },
                }))}
              />
            )}
            <div className={s.composerActions}>
              <IconAction
                label={t.mic}
                title={t.mic}
                disabled={(!mic.supported && free?.dictationsRemaining !== 0) || pending}
                onClick={() => free?.dictationsRemaining === 0 ? openPremium("dictation") : void mic.toggle()}
              >
                <Mic size={17} />
              </IconAction>
              <button
                className={s.send}
                type="submit"
                aria-label={t.send}
                disabled={pending || mic.status !== "idle" || (!draft.trim() && free?.aiRepliesRemaining !== 0)}
                onClick={() => { if (free?.aiRepliesRemaining === 0 && !draft.trim()) openPremium(); }}
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </footer>
        )}
      </form>
    </aside>
  );
}
