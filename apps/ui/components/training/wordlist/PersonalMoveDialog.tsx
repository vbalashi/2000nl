"use client";
import {DelayedReadNotice} from "@/components/system/DelayedReadNotice";
import React from "react";
import { X } from "lucide-react";
import { DialogSurface } from "@/components/practice/ui/DialogSurface";
import { IconAction } from "@/components/practice/ui/IconAction";
import { ActionButton } from "@/components/practice/ui/ActionButton";
import {
  listPersonalMoveTargets,
  type PersonalMoveTarget,
} from "@/lib/training/personalArticleClient";
import type { PersonalCardCopy } from "./personalCardCopy";
import d from "../library-v2/AuthorEntryArchiveDialog.module.css";
import s from "./personalDictionaryEntryDraft.module.css";

export function PersonalMoveDialog({
  sourceId,
  word,
  definition,
  copy,
  busy,
  onClose,
  onMove,
}: {
  sourceId: string;
  word: string;
  definition: string;
  copy: PersonalCardCopy;
  busy: boolean;
  onClose: () => void;
  onMove: (id: string) => void;
}) {
  const [items, setItems] = React.useState<PersonalMoveTarget[] | null>(null);
  const [error, setError] = React.useState(false),
    [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let current = true;
    setError(false);
    listPersonalMoveTargets(sourceId).then(
      (data) => {
        if (current) setItems(data);
      },
      () => {
        if (current) setError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [sourceId, attempt]);
  return (
    <DialogSurface
      className={d.dialog}
      onDismiss={onClose}
      aria-label={copy.choose}
    >
      <header className={s.moveHeader}>
        <h2 className={d.title}>{copy.choose}</h2>
        <IconAction label={copy.close} disabled={busy} onClick={onClose}>
          <X size={17} />
        </IconAction>
      </header>
      <p className={s.moveSource}>
        {word} · {definition}
      </p>
      {error ? (
        <p role="alert">
          {copy.loadError}{" "}
          <ActionButton onClick={() => setAttempt((v) => v + 1)}>
            {copy.retry}
          </ActionButton>
        </p>
      ) : items === null ? (
        <DelayedReadNotice><p role="status">{copy.loading}</p></DelayedReadNotice>
      ) : items.length === 0 ? (
        <p>{copy.noTargets}</p>
      ) : (
        items.map((item) => (
          <button
            key={item.entryId}
            type="button"
            disabled={busy}
            className={s.target}
            onClick={() => onMove(item.entryId)}
          >
            {item.definitions.map((text, i) => (
              <span key={i}>
                {i + 1}. {text}
              </span>
            ))}
          </button>
        ))
      )}
    </DialogSurface>
  );
}
