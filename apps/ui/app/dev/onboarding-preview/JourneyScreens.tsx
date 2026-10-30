"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { BuilderCheckpoint } from "./checkpoint";
import { LibraryDestinationTabs } from "@/components/navigation/LibraryDestination";
import { Search } from "lucide-react";
import { LibraryHeadwordGroupResultsList } from "@/components/training/wordlist/LibraryHeadwordGroupResultsList";
import { buildLibraryHeadwordGroupResults } from "@/components/training/wordlist/libraryHeadwordGroupResults";
import { LibrarySenseCardGroup } from "@/components/training/library-v2/LibrarySenseCardGroup";
import { buildLibrarySenseCardGroupModel } from "@/components/training/library-v2/librarySenseCardModel";
import { LibraryCollectionsPicker } from "@/components/training/library-v2/LibraryCollectionsPicker";
import { ApprovedTrainingBuilder } from "@/components/training/pilot/ApprovedTrainingBuilder";
import { gateBankGroup, gateFurnitureEntry } from "@/lib/platform/fixtures/senseCardV1GateFixture";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingSetupDraft } from "@/lib/training/setups/types";
import type { SavedTraining } from "@/lib/training/setups/model";
import type { TrainingSessionSize, WordListSummary } from "@/lib/types";
import { getUiMessages } from "@/lib/uiMessages";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import { includeMeaning, newPreviewDraft, previewDictionaryId as dictionaryId, type Journey } from "./journeyState";
import { previewLocales, type PreviewStage } from "./content";
import type { PreviewTranslationLanguage } from "./preferences";
import workspace from "@/components/practice/library/libraryWorkspace.module.css";
import styles from "./preview.module.css";

export const libraryStages: readonly PreviewStage[] = ["extra-sharing", "extra-stats-view", "extra-stats", "search", "result", "meaning", "collections", "new-collection", "collection-name", "collection-done", "go-training"];
export const builderStages: readonly PreviewStage[] = ["source-open", "source-pick", "exercise-open", "direction-pick", "save-training", "training-name"];
export const pickerStages: readonly PreviewStage[] = ["new-collection", "collection-name", "collection-done"];
export const isLibraryStage = (stage: PreviewStage) => libraryStages.includes(stage);
export const isBuilderStage = (stage: PreviewStage) => builderStages.includes(stage);
export const isPickerStage = (stage: PreviewStage) => pickerStages.includes(stage);

export function buttonWithText(root: string, label: string, prefix = false): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(`${root} button`))
    .find(button => button.getClientRects().length > 0 && (prefix ? button.textContent?.trim().startsWith(label) : button.textContent?.trim() === label)) ?? null;
}


type Props = {
  stage: PreviewStage; language: OnboardingLanguage; translation: PreviewTranslationLanguage;
  journey: Journey; commit: (next: Journey) => boolean; onStage: (stage: PreviewStage) => void;
  selectedEntryId: string | null; onSelectEntry: (id: string) => void;
  collectionId: string | null; onSelectCollection: (id: string) => void;
  saveError: boolean;
  editingTraining?: SavedTraining;
  restoredBuilder: BuilderCheckpoint | null;
  onBuilderChange: (snapshot: BuilderCheckpoint) => void;
  onPreviewStats: (entryId: string) => void;
  onOpenCatalog: () => void;
};

export function JourneyScreens(p: Props) {
  const { stage, language, journey } = p;
  const copy = previewLocales[language], ui = getUiMessages(language), b = ui.builder;
  const [query, setQuery] = useState("bank");
  const [draft, setDraft] = useState<TrainingSetupDraft & {sessionSize: TrainingSessionSize}>(() => p.restoredBuilder ? { ...p.restoredBuilder.draft, sessionSize: p.restoredBuilder.draft.sessionSize ?? 10 } : p.editingTraining ? {...p.editingTraining.draft, sessionSize:p.editingTraining.draft.sessionSize ?? 10} : newPreviewDraft());
  const [name, setName] = useState(p.restoredBuilder?.name ?? p.editingTraining?.name ?? copy.collectionTrainingName);
  const onStage = p.onStage;
  const onBuilderChange = p.onBuilderChange;
  useEffect(() => { if (isBuilderStage(stage)) onBuilderChange({ draft, name }); }, [draft, name, stage, onBuilderChange]);
  const entryId = p.selectedEntryId || gateFurnitureEntry.entryId;
  const group = useMemo(() => ({ ...gateBankGroup, dictionary: { ...gateBankGroup.dictionary, dictionaryId, displayName: "Dilum Nederlands" },
    entries: gateBankGroup.entries.map(entry => entry.kind === "sense-card" ? { ...entry,
      card: entry.card ? { ...entry.card, scheduler: { ...entry.card.scheduler, phase: journey.learnedEntryIds.includes(entry.entryId) ? "learning" as const : "not-started" as const, repeatCount: 0 } } : entry.card,
      translation: p.translation === "ru" ? entry.translation : null,
      contentNodes: entry.contentNodes.map(node => ({ ...node, translations: node.translations.filter(t => t.targetLanguageCode === p.translation) })),
    } : entry) }), [p.translation, journey.learnedEntryIds]);
  const groupModel = buildLibrarySenseCardGroupModel(group, language);
  const chosen = groupModel.meanings.find(meaning => meaning.entryId === entryId)!;
  const lists: WordListSummary[] = journey.collections.map(c => ({ id: c.id, name: c.name, type: "user", language_code: "nl", primary_language_code: "nl", item_count: c.entryIds.length }));
  const memberships = journey.collections.filter(c => c.entryIds.includes(entryId)).map(c => ({ listId: c.id, listType: "user" as const, name: c.name, editable: true, isActiveTrainingList: false }));

  useEffect(() => {
    if (stage !== "search" || query.trim().toLowerCase() !== "bank") return;
    const timeout = setTimeout(() => onStage("result"), 0);
    return () => clearTimeout(timeout);
  }, [query, stage, onStage]);

  if (isBuilderStage(stage)) {
    const save = async () => {
      if (!name.trim() || draft.materialMode !== "collection" || !journey.collections.some(c => `user:${c.id}` === draft.listValue && c.entryIds.length)) return false;
      const id = p.editingTraining?.id ?? `preview-training-${crypto.randomUUID()}`;
      const next = { ...journey, trainings: [...journey.trainings.filter(t => t.id !== id), { id, name: name.trim(), languageCode: "nl", draft: { ...draft, modes: [...draft.modes] } }] };
      if (!p.commit(next)) return false;
      p.onStage("complete"); return true;
    };
    return <div id="preview-builder" className={styles.builderHost} onClickCapture={event => {
      const button = (event.target as Element).closest("button");
      if (stage === "training-name" && button?.textContent?.trim() === b.cancel) requestAnimationFrame(() => p.onStage("save-training"));
      if (button?.getAttribute("aria-expanded") === "false") {
        const text = button.textContent?.trim() ?? "";
        if (stage === "source-open" && text.startsWith(b.source)) requestAnimationFrame(() => p.onStage("source-pick"));
        if (stage === "exercise-open" && text.startsWith(b.exercises)) requestAnimationFrame(() => p.onStage("direction-pick"));
      }
    }}>
      <ApprovedTrainingBuilder interfaceLanguage={language} draft={draft} name={name} onNameChange={setName}
        languageCode="nl" languageOptions={[{ value: "nl", label: "Nederlands" }]}
        lists={lists.map(list => ({ value: `user:${list.id}`, label: list.name }))}
        dictionaries={[{ value: dictionaryId, label: "Dilum Nederlands" }]} sources={[]}
        scenarios={[{ value: "understanding", label: ui.trainingOverview.exerciseType.Words, modes: ["word-to-definition", "definition-to-word"] }]}
        languagePending={false} dictionariesLoading={false} translationLanguage={p.translation === "off" ? null : p.translation}
        onLanguageChange={() => {}} onDraftChange={next => {
          setDraft(current => {
            const result = typeof next === "function" ? next(current) : next;
            if (stage === "source-pick" && result.materialMode === "collection" && journey.collections.some(c => `user:${c.id}` === result.listValue)) requestAnimationFrame(() => p.onStage("exercise-open"));
            return result;
          });
        }}
        onSelectFamily={family => setDraft(current => ({ ...current, family, scenarioId: family === "idiom" ? "idiom" : "understanding" }))}
        onToggleMode={mode => { setDraft(current => ({ ...current, family: "meaning", modes: [mode] })); if (stage === "direction-pick") p.onStage("save-training"); }}
        onMixChange={() => {}} onBack={() => p.onStage("create-training")}
        onSave={save} onBeginSave={() => p.onStage("training-name")} onStart={() => {}}
        saveDisabled={draft.materialMode !== "collection"} startDisabled={true} canSave={true}
        saveLabel={b.save} startLabel={b.start} saveNotice={p.saveError ? copy.saveError : copy.journeySaved}/>
    </div>;
  }

  return <div className={`${workspace.workspace} ${styles.libraryHost}`}>
    <h1>{ui.navigation.library}</h1>
    <div id="preview-library-tabs"><LibraryDestinationTabs language={language} destination="words" organizationEnabled sharingEnabled={false} onChange={destination=>{if(destination==="collections")p.onOpenCatalog();}}/></div>
    <div className={workspace.toolbar}>
      <div className={styles.searchBox}><Search size={18}/><input id="preview-library-search" className={workspace.input}
        aria-label={ui.library.searchPlaceholder} value={query} readOnly placeholder={ui.library.searchPlaceholder} onChange={event => setQuery(event.target.value)}/></div>
      <p className={workspace.scope}>Nederlands · Dilum Nederlands</p>
    </div>
    {(stage === "search" || stage === "result") ? <div className={workspace.results}>
      {query.trim().toLowerCase() === "bank" ? <LibraryHeadwordGroupResultsList interfaceLanguage={language} results={buildLibraryHeadwordGroupResults([group])} selectedHeadwordGroupId={null}
        onSelect={() => { p.onSelectEntry(""); p.onStage("meaning"); }}/>
        : query.trim() ? <p>{copy.noResults}</p> : null}
    </div> : <div id="preview-meaning" className={styles.meaningHost} onClickCapture={event => {
      const button = (event.target as Element).closest("button");
      if (button?.matches("[data-testid=meaning-learning-progress-trigger]")) { event.preventDefault(); event.stopPropagation(); p.onPreviewStats(button.closest("[data-entry-id]")?.getAttribute("data-entry-id") ?? entryId); }
    }}>
      <LibrarySenseCardGroup key={language} model={groupModel} interfaceLanguage={language} contentLanguage="nl" translationLanguage={p.translation === "off" ? undefined : p.translation}
        activeMeaningId={p.selectedEntryId || null} revealActiveMeaning={Boolean(p.selectedEntryId)} inlineGrading={false} translationEnabled={p.translation !== "off"}
        collectionCounts={Object.fromEntries(groupModel.meanings.map(meaning => [meaning.entryId, journey.collections.filter(c => c.entryIds.includes(meaning.entryId)).length]))}
        onActiveMeaningChange={id => { p.onSelectEntry(id); if (stage === "meaning") p.onStage("collections"); }}
        onOpenCollections={meaning => { p.onSelectEntry(meaning.entryId); p.onStage("new-collection"); }}
        onAction={() => {}}/>
    </div>}
    <div id="preview-collections" onClickCapture={event => {
      const button = (event.target as Element).closest("button");
      if (stage === "new-collection" && button?.textContent?.trim() === ui.collections.new) requestAnimationFrame(() => p.onStage("collection-name"));
    }}>
      <LibraryCollectionsPicker open={isPickerStage(stage)} headword="bank" definition={chosen.definition?.text ?? ""}
        interfaceLanguage={language} userLists={lists} memberships={memberships} busyListId={null}
        status={p.saveError ? copy.saveError : memberships.length ? copy.membershipSaved : null}
        onClose={() => { if (memberships.length && !p.collectionId) p.onSelectCollection(memberships[0].listId); p.onStage(memberships.length ? "go-training" : "collections"); }}
        onCreateList={newName => {
          const id = `preview-collection-${crypto.randomUUID()}`;
          if (p.commit({ ...journey, collections: [...journey.collections, { id, name: newName.trim(), entryIds: [entryId] }] })) { p.onSelectCollection(id); p.onStage("collection-done"); }
        }}
        onToggleList={(list, included) => {
          if (p.commit(includeMeaning(journey, list.id, entryId, !included))) { p.onSelectCollection(list.id); if (!included) p.onStage("collection-done"); }
        }}/>
    </div>
  </div>;
}
