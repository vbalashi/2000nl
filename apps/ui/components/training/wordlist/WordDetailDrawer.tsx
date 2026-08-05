import React from "react";
import type {
  DictionaryEntry,
  EntryLearningListMembership,
  WordListSummary,
} from "@/lib/types";
import { WordDetailPanel } from "../WordDetailPanel";
import { LibraryWordDetail } from "../library-v2/LibraryWordDetail";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";

type Props = {
  entry: DictionaryEntry | null;
  open: boolean;
  onClose: () => void;
  userId: string;
  contentLanguageCode: string;
  translationLang: string | null;
  interfaceLanguage: OnboardingLanguage;
  userLists: WordListSummary[];
  onListsUpdated?: () => Promise<void> | void;
  onOpenListMembership?: (membership: EntryLearningListMembership) => void;
  onUserDictionaryEntryCreated?: (entry: DictionaryEntry) => void;
  onTrainWord?: (wordId: string) => void;
  autoFetchTranslation?: boolean;
};

export function WordDetailDrawer({
  entry,
  open,
  onClose,
  userId,
  contentLanguageCode,
  translationLang,
  interfaceLanguage,
  userLists,
  onListsUpdated,
  onOpenListMembership,
  onUserDictionaryEntryCreated,
  onTrainWord,
  autoFetchTranslation = true,
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
        <button
          type="button"
          aria-label={platformV2Message(interfaceLanguage, "common.close")}
          onClick={onClose}
          className="absolute right-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xl text-slate-600 shadow-sm backdrop-blur dark:border-slate-600 dark:bg-slate-900/90 dark:text-slate-200"
        >
          ×
        </button>
        <LibraryWordDetail
          entryId={entry.id}
          headword={entry.headword}
          contentLanguageCode={entry.language_code ?? contentLanguageCode}
          translationTargetLanguageCode={translationLang}
          interfaceLanguage={interfaceLanguage}
          viewport="mobile"
          fallback={
            <WordDetailPanel
              entry={entry}
              userId={userId}
              translationLang={translationLang}
              userLists={userLists}
              onListsUpdated={onListsUpdated}
              onOpenListMembership={onOpenListMembership}
              onUserDictionaryEntryCreated={onUserDictionaryEntryCreated}
              onTrainWord={onTrainWord}
              showHeader={true}
              showActions={true}
              autoFetchTranslation={autoFetchTranslation}
            />
          }
        />
      </div>
    </div>
  );
}
