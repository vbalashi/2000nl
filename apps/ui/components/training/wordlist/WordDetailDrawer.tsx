import React from "react";
import type {
  EntryLearningListMembership,
  WordListSummary,
} from "@/lib/types";
import { LibraryWordDetail } from "../library-v2/LibraryWordDetail";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { WordDetailsHeader } from "../WordDetailsHeader";
import type { PlatformHeadwordGroupV2 } from "../../../../../packages/shared/types/platformV2";

type Props = {
  selection: {
    entryId: string;
    headword: string;
    contentLanguageCode?: string;
  } | null;
  initialGroup?: PlatformHeadwordGroupV2;
  open: boolean;
  onClose: () => void;
  userId: string;
  contentLanguageCode: string;
  translationLang: string | null;
  interfaceLanguage: OnboardingLanguage;
  userLists: WordListSummary[];
  onListsUpdated?: () => Promise<void> | void;
  onTrainWord?: (wordId: string) => void;
  onCopyToUserDictionary?: (entryId: string) => Promise<void> | void;
  onOpenListMembership?: (membership: EntryLearningListMembership) => void;
};

export function WordDetailDrawer({
  selection,
  initialGroup,
  open,
  onClose,
  userId,
  contentLanguageCode,
  translationLang,
  interfaceLanguage,
  userLists,
  onListsUpdated,
  onTrainWord,
  onCopyToUserDictionary,
  onOpenListMembership,
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

  if (!open || !selection) return null;

  return (
    <div className="absolute inset-0 z-30">
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="absolute inset-y-0 right-0 flex w-full max-w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900 sm:w-[460px]">
        <WordDetailsHeader onClose={onClose} interfaceLanguage={interfaceLanguage} />
        <div className="min-h-0 flex-1">
          <LibraryWordDetail
            entryId={selection.entryId}
            initialGroup={initialGroup}
            headword={selection.headword}
            contentLanguageCode={selection.contentLanguageCode ?? contentLanguageCode}
            translationTargetLanguageCode={translationLang}
            interfaceLanguage={interfaceLanguage}
            userId={userId}
            userLists={userLists}
            onListsUpdated={onListsUpdated}
            onTrainWord={onTrainWord}
            onCopyToUserDictionary={onCopyToUserDictionary}
            onOpenListMembership={onOpenListMembership}
            viewport="mobile"
          />
        </div>
      </div>
    </div>
  );
}
