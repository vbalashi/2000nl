"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  Trash2,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Mic,
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
import { getPartOfSpeechLabel } from "@/lib/uiMessages";
import {saveSearchChat,type SearchChat} from "./lastSearchChat";
import { getInterfaceCatalog } from "@/lib/i18n/catalog";
import {searchRecoveryCopy} from "./searchRecoveryCopy";
import s from "./personalCardAssistant.module.css";
export type { Suggestion } from "@/lib/platform/personalCardAssistantContract";
type Props = {
  discovery?: {chat:SearchChat;storageKey:string; startSearch:boolean; category:string; scope:string; onClear:()=>void; onSelect:(hit:SourceHit)=>void};
  word: string;
  definition: string;
  languageCode: string;
  interfaceLanguage: OnboardingLanguage;
  senseKey: string;
  ordinal: number;
  article?: AssistantArticle;
  session?: AssistantSession;
  onClose: () => void;
  onApply: (suggestion: Suggestion, senseKey: string) => void;
};
type Exchange = {
  question: string;
  intent?: string;
  reply?: AssistantReply;
  error?: boolean;
  applied?: number[];
};
export type AssistantSnapshot = {turns:Exchange[];draft:string};
export type AssistantSession = Map<string,AssistantSnapshot>;
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
}: Props) {
  const t = assistantLabels(interfaceLanguage);
  const recovery = searchRecoveryCopy(interfaceLanguage);
  const context = article ?? {
    partOfSpeech: null,
    senses: [{ definition, fields: [] }],
  };
  const restored = discovery?.chat ?? session?.get(senseKey);
  const [turns, setTurns] = useState<Exchange[]>(restored?.turns ?? []),
    [draft, setDraft] = useState(restored?.draft ?? ""),
    [pending, setPending] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null),
    [copied, setCopied] = useState("");
  const catalog = getInterfaceCatalog(interfaceLanguage);
  const speech = catalog.features.dictation;
  const mic = useAzureDictation((text) =>
    setDraft((current) =>
      (current.trimEnd() + " " + text).trimStart().slice(0, 1500),
    ),
  );
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
      draft:
        draft ||
        (completed.length < turns.length
          ? turns[turns.length - 1].question
          : ""),
    };
    session?.set(senseKey,snapshot);
    if (searchStorageKey && searchChat) saveSearchChat(searchStorageKey,searchChat,snapshot);
  }, [session, senseKey, turns, draft, searchStorageKey, searchChat]);
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
    if (!retry) setDraft("");
    setPending(true);
    try {
      const response = await fetch("/api/library/card-assistant", {
        method: "POST",
        headers: await authenticatedJsonHeaders(),
        signal: controller.signal,
        body: JSON.stringify({
          word:discovery && !word ? question.slice(0,300) : word,
          definition,
          article: context,
          selectedOrdinal: ordinal,
          question,
          languageCode,
          interfaceLanguage,
          intent: discovery ? "find-meaning" : intent,
          searchCategory:discovery?.category,
          searchScope:discovery?.scope,
          history: conversation
            .slice(-8)
            .map((t) => ({ ...t, text: t.text.slice(0, 1500) })),
        }),
      });
      if (!response.ok) throw new Error("request_failed");
      const reply: AssistantReply = await response.json();
      setTurns((old) =>
        old.map((turn, i) =>
          i === old.length - 1 ? { ...turn, reply } : turn,
        ),
      );
    } catch {
      if (!controller.signal.aborted)
        setTurns((old) =>
          old.map((turn, i) =>
            i === old.length - 1 ? { ...turn, error: true } : turn,
          ),
        );
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  };
  const initialSearch = useRef(discovery?.startSearch && word ? recovery.prompt + " «" + word + "»" : null);
  const sendInitial = useRef(ask);
  sendInitial.current = ask;
  useEffect(() => {
    if (!initialSearch.current) return;
    const timer = window.setTimeout(() => { void sendInitial.current(initialSearch.current!); },0);
    return () => window.clearTimeout(timer);
  }, []);
  function scroll(direction: number) {
    const h = history.current;
    h?.scrollBy({
      top: direction * h.clientHeight * 0.8,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
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
        {discovery && (turns.length>0 || draft) && <IconAction label={recovery.clearChat} title={recovery.clearChat} disabled={pending} onClick={()=>{setTurns([]);setDraft("");discovery.onClear();composer.current?.focus();}}>
          <Trash2 size={15}/>
        </IconAction>}
        <IconAction label={t.close} onClick={onClose}>
          <X size={17} />
        </IconAction>
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
            {turns.map((turn, i) => (
              <div key={i}>
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
                    <p>{turn.reply.message}</p>
                    {turn.reply.searched && !turn.reply.sources?.length && (
                      <small>{t.none}</small>
                    )}
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
                    {turn.reply.suggestions.map((proposal, j) => {
                      const text =
                        proposal.kind === "partOfSpeech"
                          ? (getPartOfSpeechLabel(
                              interfaceLanguage,
                              proposal.text,
                            ) ?? proposal.text)
                          : proposal.text;
                      return (
                        <section className={s.proposal} key={j}>
                          <small>{proposal.kind === "headword" ? catalog.features.personalCard.word : t[proposal.kind]}</small>
                          <p
                            id={"assistant-copy-" + i + "-" + j}
                            lang={
                              proposal.kind === "partOfSpeech"
                                ? interfaceLanguage
                                : languageCode
                            }
                          >
                            {text}
                          </p>
                          <ActionButton
                            disabled={turn.applied?.includes(j) || (proposal.kind === "headword" && !!word.trim())}
                            onClick={() => {
                              onApply(proposal, senseKey);
                              setTurns((old) =>
                                old.map((v, k) =>
                                  k === i
                                    ? {
                                        ...v,
                                        applied: [...(v.applied ?? []), j],
                                      }
                                    : v,
                                ),
                              );
                            }}
                          >
                            {turn.applied?.includes(j) ? t.used : t.use}
                          </ActionButton>
                          <ActionButton
                            onClick={() =>
                              void navigator.clipboard
                                .writeText(text)
                                .then(() => setCopied(i + "-" + j))
                                .catch(() => {
                                  const range = document.createRange();
                                  const target = document.getElementById(
                                    "assistant-copy-" + i + "-" + j,
                                  );
                                  if (target) {
                                    range.selectNodeContents(target);
                                    const sel = window.getSelection();
                                    sel?.removeAllRanges();
                                    sel?.addRange(range);
                                  }
                                })
                            }
                          >
                            {copied === i + "-" + j ? (
                              <Check size={14} aria-label={t.copied} />
                            ) : (
                              t.copy
                            )}
                          </ActionButton>
                        </section>
                      );
                    })}
                  </>
                )}
                {turn.error && (
                  <>
                    <p role="alert">{t.error}</p>
                    {i === turns.length - 1 && (
                      <ActionButton
                        disabled={pending || mic.status !== "idle"}
                        onClick={() => void ask(turn.question, turn.intent, true)}
                      >
                        {catalog.common.retry}
                      </ActionButton>
                    )}
                  </>
                )}
              </div>
            ))}
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
          void ask(draft);
        }}
      >
        {(mic.issue || mic.status !== "idle") && (
          <small role="status" className={mic.issue ? undefined : "sr-only"}>
            {mic.issue
              ? speech[mic.issue]
              : mic.status !== "idle"
                ? speech[mic.status]
                : ""}
          </small>
        )}
        <textarea
          ref={composer}
          value={draft}
          maxLength={1500}
          rows={2}
          aria-label={discovery ? recovery.follow : t.type}
          placeholder={discovery ? recovery.follow : t.type}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void ask(draft);
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
                  onSelect: () => void ask(t[key], key),
                }))}
              />
            )}
            <IconAction
              label={t.mic}
              title={t.mic}
              disabled={!mic.supported || pending}
              onClick={() => void mic.toggle()}
            >
              <Mic size={17} />
            </IconAction>
            <button
              className={s.send}
              type="submit"
              aria-label={t.send}
              disabled={pending || mic.status !== "idle" || !draft.trim()}
            >
              <ArrowUp size={18} />
            </button>
          </footer>
        )}
      </form>
    </aside>
  );
}
