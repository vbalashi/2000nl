import React from "react";
import type { ReactNode } from "react";
import {SheetDragProvider} from "@/components/practice/ui/SheetDragRegion";
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
import { assistantLabels } from "@/lib/platform/personalCardAssistantContract";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import type { PlatformHeadwordGroupV2 } from "../../../../../packages/shared/types/platformV2";

import type { OpenIndependentCopy } from "../library-v2/IndependentEntryCopyDialog";

type Props = {
  selection: {
    entryId: string;
    headword: string;
    contentLanguageCode?: string;
  } | null;
  draft?: ReactNode;
  assistantMode?: boolean;
  initialGroup?: PlatformHeadwordGroupV2;
  open: boolean;
  onClose: () => void;
  userId: string;
  contentLanguageCode: string;
  translationLang: string | null;
  interfaceLanguage: OnboardingLanguage;
  userLists: WordListSummary[];
  currentCollection?: WordListSummary;
  dictionaryIdInSummary?: string | null;
  onEditPersonal?: (entryIds: string[]) => void;
  onArchived?: (entryId: string) => void;
  onOpenCopied?: (copy: OpenIndependentCopy) => void;
  onListsUpdated?: () => Promise<void> | void;
  onTrainWord?: (wordId: string) => void;
  onOpenListMembership?: (membership: EntryLearningListMembership) => void;
};

export function WordDetailDrawer({
  selection,
  draft,
  assistantMode = false,
  initialGroup,
  open,
  onClose,
  userId,
  contentLanguageCode,
  translationLang,
  interfaceLanguage,
  userLists,
  currentCollection,
  dictionaryIdInSummary,
  onEditPersonal,
  onArchived,
  onOpenCopied,
  onListsUpdated,
  onTrainWord,
  onOpenListMembership,
}: Props) {
  const [entered, setEntered] = React.useState(false);
  const resize = useLibrarySheetResize(open ? selection?.entryId ?? (draft ? "personal-entry-draft" : null) : null,onClose,assistantMode);
  const { expanded, ref } = resize;
  const assistant = assistantLabels(interfaceLanguage);
  const handleLabel = assistantMode
    ? assistant[expanded ? "collapseChat" : "expandChat"]
    : getUiMessages(interfaceLanguage).library[expanded ? "collapseCard" : "expandCard"];
  const [keyboardViewport, setKeyboardViewport] = React.useState<{ bottom: number; height: number }>();
  React.useEffect(() => {
    if (!open) { setKeyboardViewport(undefined); return; }
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      // WebKit can report the same pan in both scrollY and offsetTop after
      // unlocking; do not subtract that displacement twice.
      const visualPan = Math.max(0, viewport.offsetTop - window.scrollY);
      const occluded = Math.max(0, window.innerHeight - viewport.height - visualPan);
      const editing = ref.current?.contains(document.activeElement) &&
        document.activeElement?.matches('input, textarea, [contenteditable="true"]');
      setKeyboardViewport(editing && viewport.height < window.innerHeight - 100 ? { bottom: occluded + 8, height: Math.max(0, viewport.height - 16) } : undefined);
    };
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    document.addEventListener('focusin', update);
    const focusout = () => queueMicrotask(update);
    document.addEventListener('focusout', focusout);
    update();
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', focusout);
    };
  }, [open, ref]);
  const pointerStartedInside = React.useRef(false);
  React.useEffect(() => {
    if (!open) return;
    const trackPointerStart = (event: PointerEvent) => {
      if (event.isPrimary) {
        pointerStartedInside.current = event.target instanceof Node && !!ref.current?.contains(event.target);
      }
    };
    const dismissOutside = (event: MouseEvent) => {
      const panel = ref.current;
      const target = event.target;
      // Releasing a drag or losing capture can retarget its click outside the sheet.
      if (expanded || (event.detail !== 0 && pointerStartedInside.current)) return;
      if (!panel?.getClientRects().length || !(target instanceof Element) || panel.contains(target)) return;
      // The assistant, menus and dialogs opened by the card may render through a portal.
      if (target.closest('[data-personal-assistant],dialog,[role="dialog"],[role="menu"],[role="listbox"],[popover]')) return;
      onClose();
    };
    document.addEventListener("pointerdown", trackPointerStart, true);
    document.addEventListener("click", dismissOutside, true);
    return () => {
      document.removeEventListener("pointerdown", trackPointerStart, true);
      document.removeEventListener("click", dismissOutside, true);
    };
  }, [open, expanded, ref, onClose]);
  React.useEffect(() => { setEntered(open); }, [open, selection?.entryId]);
  React.useEffect(() => { if (!open) setEntered(false); }, [open]);
  if (!open || (!selection && !draft)) return null;

  const detail = (revealActiveMeaning: boolean) => selection ? <LibraryWordDetail
    revealActiveMeaning={revealActiveMeaning}
    entryId={selection.entryId}
    initialGroup={initialGroup}
    headword={selection.headword}
    contentLanguageCode={selection.contentLanguageCode ?? contentLanguageCode}
    translationTargetLanguageCode={translationLang}
    interfaceLanguage={interfaceLanguage}
    userId={userId}
    userLists={userLists}
    currentCollection={currentCollection}
      dictionaryIdInSummary={dictionaryIdInSummary}
    onEditPersonal={onEditPersonal}
      onArchived={onArchived}
      onOpenCopied={onOpenCopied}
      onListsUpdated={onListsUpdated}
    onTrainWord={onTrainWord}
    onOpenListMembership={onOpenListMembership}
    viewport="mobile"
  /> : draft;

  return <>
  {keyboardViewport && <div aria-hidden="true" className={sheet.keyboardFill} style={{height: keyboardViewport.bottom + 12}} />}
  <section ref={resize.ref} className={sheet.librarySheet} data-assistant={assistantMode || undefined} data-expanded={expanded} data-keyboard={keyboardViewport ? 'true' : undefined}
    data-dragging={resize.dragging} style={{ height: resize.height, ...(keyboardViewport ? { bottom: keyboardViewport.bottom, minHeight: 0, maxHeight: keyboardViewport.height } : {}) }}
    aria-label={platformV2Message(interfaceLanguage,"senseCard.wordDetails.open")}>
    <SheetHandle controller={resize} label={handleLabel}/>
    <SheetDragProvider value={resize}><WordDetailsCloseProvider onClose={onClose} interfaceLanguage={interfaceLanguage}>
      <div className="min-h-0 flex-1">{detail(entered)}</div>
    </WordDetailsCloseProvider></SheetDragProvider>
  </section></>;
}
