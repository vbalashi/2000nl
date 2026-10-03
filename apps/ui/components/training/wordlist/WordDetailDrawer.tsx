import React from "react";
import { useLibrarySheetResize } from "./useLibrarySheetResize";
import type {
  EntryLearningListMembership,
  WordListSummary,
} from "@/lib/types";
import { LibraryWordDetail } from "../library-v2/LibraryWordDetail";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { WordDetailsHeader, WordDetailsCloseProvider } from "../WordDetailsHeader";
import { sharedArticlePresentationV1Enabled } from "@/lib/platform/platformV2Rollout";
import sheet from "@/components/practice/article/wordDetailsSheet.module.css";
import { getUiMessages } from "@/lib/uiMessages";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
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
  const approved = sharedArticlePresentationV1Enabled();
  const [entered, setEntered] = React.useState(false);
  const resize = useLibrarySheetResize(open ? selection?.entryId ?? null : null);
  const { expanded } = resize;
  React.useEffect(() => { setEntered(open); }, [open, selection?.entryId]);
  React.useEffect(() => { if (!open) setEntered(false); }, [open]);
  React.useEffect(() => {
    if (!open || approved) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, approved]);

  if (!open || !selection) return null;

  const detail = (revealActiveMeaning: boolean) => <LibraryWordDetail
    revealActiveMeaning={revealActiveMeaning}
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
  />;

  if (approved) return <section ref={resize.ref} className={sheet.librarySheet} data-expanded={expanded}
    data-dragging={resize.dragging} style={resize.height === undefined ? undefined : { height: resize.height }}
    aria-label={platformV2Message(interfaceLanguage,"senseCard.wordDetails.open")}>
    <button type="button" className={sheet.handle} aria-expanded={expanded}
      aria-keyshortcuts="ArrowUp ArrowDown Home End"
      aria-label={getUiMessages(interfaceLanguage).library[expanded ? "collapseCard" : "expandCard"]}
      {...resize.handleProps}><span aria-hidden="true"/></button>
    <WordDetailsCloseProvider onClose={onClose} interfaceLanguage={interfaceLanguage}>
      <div className="min-h-0 flex-1">{detail(entered)}</div>
    </WordDetailsCloseProvider>
  </section>;

  return (
    <div className="absolute inset-0 z-30">
      <div
        className={`absolute inset-0 ${sharedArticlePresentationV1Enabled() ? sheet.backdrop : "bg-black/20"}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div className={`absolute inset-y-0 right-0 flex w-full max-w-full flex-col overflow-hidden sm:w-[460px] ${sharedArticlePresentationV1Enabled() ? sheet.panel : "bg-white shadow-2xl dark:bg-slate-900"}`}>
        <WordDetailsHeader onClose={onClose} interfaceLanguage={interfaceLanguage} />
        <div className="min-h-0 flex-1">
          {detail(true)}
        </div>
      </div>
    </div>
  );
}
