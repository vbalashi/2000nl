import React from "react";
import type { DictionaryEntry, WordListSummary } from "@/lib/types";
import { WordDetailPanel } from "../WordDetailPanel";

type Props = {
  entry: DictionaryEntry | null;
  open: boolean;
  onClose: () => void;
  userId: string;
  translationLang: string | null;
  selectedListName?: string;
  userLists: WordListSummary[];
  onListsUpdated?: () => Promise<void> | void;
  onTrainWord?: (wordId: string) => void;
};

export function WordDetailDrawer({
  entry,
  open,
  onClose,
  userId,
  translationLang,
  selectedListName,
  userLists,
  onListsUpdated,
  onTrainWord,
}: Props) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !entry) return null;

  return (
    <div className="absolute inset-0 z-30">
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="absolute inset-y-0 right-0 w-full max-w-full overflow-hidden bg-white shadow-2xl dark:bg-slate-900 sm:w-[460px]">
        <WordDetailPanel
          entry={entry}
          userId={userId}
          translationLang={translationLang}
          selectedListName={selectedListName}
          userLists={userLists}
          onListsUpdated={onListsUpdated}
          onTrainWord={onTrainWord}
          showHeader={true}
          showActions={true}
        />
      </div>
    </div>
  );
}
