import React from "react";
import {SheetHandle} from "@/components/practice/ui/SheetHandle";
import { useLibrarySheetResize } from "./useLibrarySheetResize";
import type {
  EntryLearningListMembership,
  WordListSummary,
} from "@/lib/types";
import { LibraryWordDetail } from "../library-v2/LibraryWordDetail";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { WordDetailsCloseProvider } from "../WordDetailsHeader";
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
  onOpenListMembership,
}: Props) {
  const [entered, setEntered] = React.useState(false);
  const resize = useLibrarySheetResize(open ? selection?.entryId ?? null : null,onClose);
  const { expanded } = resize;
  React.useEffect(() => { setEntered(open); }, [open, selection?.entryId]);
  React.useEffect(() => { if (!open) setEntered(false); }, [open]);
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
    onOpenListMembership={onOpenListMembership}
    viewport="mobile"
  />;

  return <section ref={resize.ref} className={sheet.librarySheet} data-expanded={expanded}
    data-dragging={resize.dragging} style={resize.height === undefined ? undefined : { height: resize.height }}
    aria-label={platformV2Message(interfaceLanguage,"senseCard.wordDetails.open")}>
    <SheetHandle controller={resize} label={getUiMessages(interfaceLanguage).library[expanded ? "collapseCard" : "expandCard"]}/>
    <WordDetailsCloseProvider onClose={onClose} interfaceLanguage={interfaceLanguage}>
      <div className="min-h-0 flex-1">{detail(entered)}</div>
    </WordDetailsCloseProvider>
  </section>;
}
