"use client";
import React from "react";
import { BookOpen } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { DialogSurface } from "@/components/practice/ui/DialogSurface";
import {
  previewEntryCopy,
  reconcileEntryCopy,
  submitEntryCopy,
  type EntryCopyResult,
} from "@/lib/platform/independentEntryCopyClient";
import {
  parseEntryCopyCommand,
  type EntryCopyCommand,
  type EntryCopyPreview,
} from "@/lib/platform/independentEntryCopyContract";
import { independentEntryCopyText } from "@/lib/platform/independentEntryCopyText";
import s from "./AuthorEntryArchiveDialog.module.css";
export type OpenIndependentCopy = {
  entryId: string;
  dictionaryId: string;
  headword: string;
  contentLanguageCode: string;
};
export function IndependentEntryCopyDialog({
  entryId,
  headword,
  dictionaryName,
  userId,
  language,
  onClose,
  onOpen,
  onReviewSource,
}: {
  entryId: string;
  headword: string;
  dictionaryName: string;
  contentLanguageCode: string;
  userId: string;
  language: OnboardingLanguage;
  onClose: () => void;
  onOpen: (copy: OpenIndependentCopy) => void;
  onReviewSource: () => void;
}) {
  const copy = independentEntryCopyText(language),
    titleId = React.useId();
  const [preview, setPreview] = React.useState<EntryCopyPreview | null>(null);
  const [pending, setPending] = React.useState(true);
  const [result, setResult] = React.useState<EntryCopyResult | null>(null);
  const command = React.useRef<EntryCopyCommand | null>(null),
    busy = React.useRef(false),
    mounted = React.useRef(true);
  const storageKey = `2000nl:entry-copy:${userId}:${entryId}`;
  const save = (value: EntryCopyCommand | null) => {
    command.current = value;
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
      else sessionStorage.removeItem(storageKey);
      return true;
    } catch {
      return false;
    }
  };
  const load = React.useCallback(async () => {
    try {
      const value = await previewEntryCopy(entryId, userId);
      if (mounted.current) {
        setPreview(value);
        if (!value) setResult({ status: "rejected" });
      }
    } catch {
      if (mounted.current) setResult({ status: "rejected" });
    } finally {
      if (mounted.current) setPending(false);
    }
  }, [entryId, userId]);
  React.useEffect(() => {
    mounted.current = true;
    let stopped = false;
    const initialize = async () => {
      let saved: EntryCopyCommand | null = null;
      try {
        saved = parseEntryCopyCommand(
          JSON.parse(sessionStorage.getItem(storageKey) ?? "null"),
        );
      } catch {
        /* No recoverable intent. */
      }
      if (saved && saved.sourceEntryId === entryId) {
        command.current = saved;
        const receipt = await reconcileEntryCopy(saved.operationId, userId);
        if (stopped) return;
        if (receipt?.status === "completed") {
          setResult(receipt);
          setPending(false);
          return;
        }
        setResult({ status: "uncertain" });
        setPending(false);
        return;
      }
      await load();
    };
    void initialize();
    return () => {
      stopped = true;
      mounted.current = false;
    };
  }, [entryId, userId, storageKey, load]);
  const submit = async () => {
    if (busy.current || !preview) return;
    busy.current = true;
    setPending(true);
    try {
      if (
        !command.current &&
        !save({
          operationId: crypto.randomUUID(),
          sourceEntryId: entryId,
          expectedRevision: preview.revision,
        })
      ) {
        command.current = null;
        setResult({ status: "rejected" });
        return;
      }
      const value = await submitEntryCopy(command.current!, userId);
      if (!mounted.current) return;
      setResult(value);
      // A rejected retry cannot disprove a prior in-flight write. Keep the
      // intent until completion, or a source revision fence makes it obsolete.
      if (value.status === "changed") save(null);
    } catch {
      if (mounted.current) setResult({ status: "uncertain" });
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };
  const check = async () => {
    if (busy.current || !command.current) return;
    busy.current = true;
    setPending(true);
    const receipt = await reconcileEntryCopy(
      command.current.operationId,
      userId,
    );
    if (mounted.current) {
      if (receipt?.status === "unknown") {
        // An explicit subsequent confirmation reuses this intent, even if the first
        // request reaches the server late. It cannot create a second identity.
        setResult(null);
        await load();
      } else
        setResult(
          receipt?.status === "completed" ? receipt : { status: "uncertain" },
        );
      setPending(false);
    }
    busy.current = false;
  };
  const completed = result?.status === "completed";
  const close = () => {
    if (pending || busy.current) return;
    if (completed) save(null);
    onClose();
  };
  return (
    <DialogSurface
      className={s.dialog}
      lang={language}
      aria-labelledby={titleId}
      onDismiss={close}
    >
      <h2 className={s.title} id={titleId}>
        {completed ? copy.success : copy.title(preview?.headword ?? headword)}
      </h2>
      <p className={s.body}>
        <BookOpen
          size={14}
          aria-hidden="true"
          style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }}
        />
        {preview?.sourceDictionaryName ?? dictionaryName} → {copy.destination}
      </p>
      {!completed ? <p className={s.body}>{copy.notice}</p> : null}
      {pending ? (
        <p className={s.body} role="status">
          {command.current ? copy.pending : copy.loading}
        </p>
      ) : null}
      {result && !completed ? (
        <p className={s.body} role="alert">
          {result.status === "changed"
            ? copy.changed
            : result.status === "uncertain"
              ? copy.uncertain
              : copy.failed}
        </p>
      ) : null}
      <div className={s.actions}>
        <button
          type="button"
          className={s.button}
          autoFocus
          disabled={pending}
          onClick={close}
        >
          {completed ? copy.close : copy.cancel}
        </button>
        {completed ? (
          <button
            type="button"
            className={`${s.button} ${s.primary}`}
            onClick={() => {
              save(null);
              onOpen({
                entryId: result.entryId,
                dictionaryId: result.dictionaryId,
                headword: result.headword,
                contentLanguageCode: result.languageCode,
              });
            }}
          >
            {copy.open}
          </button>
        ) : result?.status === "uncertain" ? (
          <button
            type="button"
            className={`${s.button} ${s.primary}`}
            disabled={pending}
            onClick={() => void check()}
          >
            {copy.check}
          </button>
        ) : result?.status === "changed" ? (
          <button
            type="button"
            className={`${s.button} ${s.primary}`}
            disabled={pending}
            onClick={() => {
              save(null);
              onReviewSource();
            }}
          >
            {copy.refresh}
          </button>
        ) : (
          <button
            type="button"
            className={`${s.button} ${s.primary}`}
            disabled={pending || !preview}
            onClick={() => void submit()}
          >
            {copy.confirm}
          </button>
        )}
      </div>
    </DialogSurface>
  );
}
