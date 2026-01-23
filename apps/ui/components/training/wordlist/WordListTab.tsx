import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addWordsToUserList,
  createUserList,
  fetchUserListMembership,
  fetchWordsForList,
  removeWordsFromUserList,
  searchWordEntries,
  deleteUserList,
} from "@/lib/trainingService";
import type { DictionaryEntry, WordListSummary, WordListType } from "@/lib/types";
import { DropUpSelect } from "../DropUpSelect";
import { WordsToolbar, type AttributeFilter } from "./WordsToolbar";
import { WordsListMobile } from "./WordsListMobile";
import { WordDetailDrawer } from "./WordDetailDrawer";
import { MobileListPickerSheet } from "./MobileListPickerSheet";

type Props = {
  open: boolean;
  userId: string;
  language: string;
  onLanguageChange: (value: string) => void;
  translationLang: string | null;
  wordListType: WordListType | null;
  curatedLists: WordListSummary[];
  userLists: WordListSummary[];
  listsLoading: boolean;
  listsError: string | null;
  selectedListId: string | null;
  setSelectedListId: (id: string | null) => void;
  selectedList: WordListSummary | null;
  selectedListName: string;
  onListChange: (value: WordListSummary) => void;
  reloadLists: () => Promise<void>;
  notifyListsUpdated: () => void;
  onTrainWord?: (wordId: string) => void;
  /** Focus the search field when the tab mounts. */
  autoFocusQuery?: boolean;
};

export function WordListTab({
  open,
  userId,
  language,
  onLanguageChange,
  translationLang,
  wordListType: _wordListType,
  curatedLists,
  userLists,
  listsLoading,
  listsError,
  selectedListId,
  setSelectedListId,
  selectedList,
  selectedListName,
  onListChange,
  reloadLists,
  notifyListsUpdated,
  onTrainWord,
  autoFocusQuery,
}: Props) {
  const [query, setQuery] = useState("");
  const [partOfSpeech, setPartOfSpeech] = useState("");
  const [attributeFilters, setAttributeFilters] = useState<AttributeFilter[]>([]);
  const [wordResults, setWordResults] = useState<DictionaryEntry[]>([]);
  const [wordTotal, setWordTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [searchLoading, setSearchLoading] = useState(false);
  // applyListFilter: false = show all words (global), true = filter by selected list
  const [applyListFilter, setApplyListFilter] = useState(false);
  // Track subscription gating
  const [isLocked, setIsLocked] = useState(false);
  const [maxAllowed, setMaxAllowed] = useState<number | null>(null);

  // Derive nt2Only from attributeFilters for backward compatibility with search
  const nt2Only = attributeFilters.includes("nt2-2k");
  const filterFrozen = attributeFilters.includes("frozen");
  const filterHidden = attributeFilters.includes("dont-show");
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(
    new Set()
  );
  const [detailEntry, setDetailEntry] = useState<DictionaryEntry | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTargetMode, setCopyTargetMode] = useState<"existing" | "new">(
    "existing"
  );
  const [copyTargetListId, setCopyTargetListId] = useState<string | null>(null);
  const [copyNewListName, setCopyNewListName] = useState("");
  const [copyNewListDescription, setCopyNewListDescription] = useState("");
  const [copyBusy, setCopyBusy] = useState(false);
  const [deletingList, setDeletingList] = useState(false);
  const [membershipSet, setMembershipSet] = useState<Set<string>>(new Set());
  const [mobileListPickerOpen, setMobileListPickerOpen] = useState(false);
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  // Default copy target to first user list (excluding the currently selected user list).
  useEffect(() => {
    if (copyTargetMode !== "existing") return;
    if (copyTargetListId) return;
    const fallback =
      userLists.find((l) => l.id !== selectedListId)?.id ?? userLists[0]?.id ?? null;
    if (fallback) setCopyTargetListId(fallback);
  }, [copyTargetMode, copyTargetListId, userLists, selectedListId]);

  const runSearch = useCallback(async () => {
    if (!open) return;
    setSearchLoading(true);

    // If list filter is on and we have a selected list, fetch from that list
    // Otherwise, do a global search
    const useListFilter = applyListFilter && selectedListId;
    const selectedType = selectedList?.type ?? "curated";

    const result = useListFilter
      ? await fetchWordsForList(selectedListId!, selectedType, {
          query: query || undefined,
          partOfSpeech: partOfSpeech || undefined,
          isNt2: nt2Only ? true : undefined,
          filterFrozen: filterFrozen ? true : undefined,
          filterHidden: filterHidden ? true : undefined,
          page,
          pageSize,
        })
      : await searchWordEntries({
          query: query || undefined,
          partOfSpeech: partOfSpeech || undefined,
          isNt2: nt2Only ? true : undefined,
          filterFrozen: filterFrozen ? true : undefined,
          filterHidden: filterHidden ? true : undefined,
          page,
          pageSize,
        });

    setWordResults(result.items);
    setWordTotal(result.total);
    setIsLocked(result.isLocked ?? false);
    setMaxAllowed(result.maxAllowed ?? null);
    setSearchLoading(false);
  }, [
    open,
    applyListFilter,
    selectedListId,
    selectedList?.type,
    query,
    partOfSpeech,
    nt2Only,
    filterFrozen,
    filterHidden,
    page,
    pageSize,
  ]);

  useEffect(() => {
    if (!open) return;
    void runSearch();
  }, [runSearch, open]);

  // When paging or changing filters, scroll the list back to the top so the first
  // items of the new page are visible while pagination stays on screen (mobile UX).
  useEffect(() => {
    const el = listScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [page, query, partOfSpeech, attributeFilters, applyListFilter, selectedListId]);

  const hasSelection = selectedWordIds.size > 0;
  const selectedIds = useMemo(() => Array.from(selectedWordIds), [selectedWordIds]);

  // For user lists, compute which selected IDs are already in the target list.
  useEffect(() => {
    const targetListId = selectedList?.type === "user" ? selectedList.id : null;
    if (!targetListId || selectedIds.length === 0) {
      setMembershipSet(new Set());
      return;
    }

    let cancelled = false;
    void (async () => {
      const set = await fetchUserListMembership(targetListId, selectedIds);
      if (cancelled) return;
      setMembershipSet(set);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedList, selectedIds]);

  const selectedInTargetCount =
    selectedList?.type === "user"
      ? selectedIds.filter((id) => membershipSet.has(id)).length
      : 0;
  const selectedNotInTargetCount =
    selectedList?.type === "user"
      ? selectedIds.filter((id) => !membershipSet.has(id)).length
      : 0;

  const toggleSelected = useCallback((id: string) => {
    setSelectedWordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!detailEntry) return;
      // Close drawer first (and prevent SettingsModal from closing).
      event.preventDefault();
      event.stopImmediatePropagation();
      setDetailEntry(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailEntry]);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Use flex on mobile (single column), grid on desktop */}
      <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[320px,1fr] md:gap-6">
        <aside className="hidden min-h-0 md:block">
          <div className="h-full overflow-y-auto pr-1">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Taal
                </p>
                <div className="mt-2">
                  <DropUpSelect
                    label="Taal"
                    value={language}
                    options={[
                      { value: "nl", label: "Nederlands" },
                      { value: "en", label: "English" },
                      { value: "de", label: "Deutsch" },
                      { value: "fr", label: "Français" },
                    ]}
                    onChange={onLanguageChange}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">
                    Kant-en-klare lijsten
                  </p>
                  {listsLoading ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Laden...
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 space-y-2">
                  {curatedLists.map((list) => {
                    const isActive = list.id === selectedListId;
                    return (
                      <button
                        key={list.id}
                        type="button"
                        onClick={() => {
                          setSelectedListId(list.id);
                          // Don't reset filters or change applyListFilter - just change target list
                          setSelectedWordIds(new Set());
                          setActionMessage(null);
                          onListChange(list);
                        }}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition hover:shadow-sm dark:border-slate-700 ${
                          isActive
                            ? "border-primary/60 bg-primary/5 text-slate-900 dark:bg-primary/10 dark:text-white"
                            : "border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between text-sm font-semibold">
                          <span className="flex items-center gap-1.5">
                            {list.name}
                          </span>
                          {isActive ? (
                            <span className="text-[10px] uppercase text-primary dark:text-primary-light">
                              actief
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {list.item_count ?? "—"} woorden
                        </p>
                      </button>
                    );
                  })}
                  {!curatedLists.length && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Geen lijsten gevonden.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">
                    Je lijsten
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        // Reuse the copy dialog "new list" flow as a quick-create affordance.
                        setCopyNewListName("Nieuwe lijst");
                        setCopyNewListDescription("");
                        setCopyTargetMode("new");
                        setCopyTargetListId(null);
                        setCopyDialogOpen(true);
                      }}
                      className="text-xs font-semibold text-primary hover:underline dark:text-primary-light"
                    >
                      Nieuwe lijst
                    </button>
                    {selectedList?.type === "user" ? (
                      <button
                        type="button"
                        disabled={deletingList}
                        onClick={async () => {
                          if (!selectedList) return;
                          const confirmed = window.confirm(
                            `Weet je zeker dat je '${selectedList.name}' wil verwijderen?`
                          );
                          if (!confirmed) return;
                          setActionMessage(null);
                          setDeletingList(true);
                          const { error } = await deleteUserList(selectedList.id);
                          if (error) {
                            setActionMessage("Kon lijst niet verwijderen.");
                          } else {
                            setActionMessage("Lijst verwijderd.");
                            setSelectedWordIds(new Set());
                            setSelectedListId(null);
                            setCopyTargetListId(null);
                            await reloadLists();
                            notifyListsUpdated();
                          }
                          setDeletingList(false);
                        }}
                        className="text-xs font-semibold text-red-500 hover:underline disabled:opacity-60"
                      >
                        Verwijder lijst
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {userLists.map((list) => {
                    const isActive = list.id === selectedListId;
                    return (
                      <button
                        key={list.id}
                        type="button"
                        onClick={() => {
                          setSelectedListId(list.id);
                          // Don't reset filters or change applyListFilter - just change target list
                          setSelectedWordIds(new Set());
                          setActionMessage(null);
                          onListChange(list);
                        }}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition hover:shadow-sm dark:border-slate-700 ${
                          isActive
                            ? "border-primary/60 bg-primary/5 text-slate-900 dark:bg-primary/10 dark:text-white"
                            : "border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between text-sm font-semibold">
                          <span>{list.name}</span>
                          {isActive ? (
                            <span className="text-[10px] uppercase text-primary dark:text-primary-light">
                              actief
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {list.item_count ?? "—"} woorden
                        </p>
                      </button>
                    );
                  })}
                  {!userLists.length && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Nog geen eigen lijsten. Maak er zo één aan en voeg woorden toe.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile UX: toolbars scroll with list; footer stays visible. */}
        <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          {/* Desktop: Toolbar stays fixed above the list */}
          <div className="hidden shrink-0 md:block">
          <WordsToolbar
            applyListFilter={applyListFilter}
            selectedListName={selectedListName}
            selectedListId={selectedListId}
            wordTotal={wordTotal}
            selectedCount={selectedWordIds.size}
            query={query}
            partOfSpeech={partOfSpeech}
            nt2Only={nt2Only}
            selectedList={selectedList}
            autoFocusQuery={autoFocusQuery}
            isLocked={isLocked}
            maxAllowed={maxAllowed}
            attributeFilters={attributeFilters}
            onQueryChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            onPartOfSpeechChange={(value) => {
              setPartOfSpeech(value);
              setPage(1);
            }}
            onNt2OnlyChange={(value) => {
              // Toggle nt2-2k in attributeFilters
              if (value) {
                setAttributeFilters((prev) =>
                  prev.includes("nt2-2k") ? prev : [...prev, "nt2-2k"]
                );
              } else {
                setAttributeFilters((prev) => prev.filter((f) => f !== "nt2-2k"));
              }
              setPage(1);
            }}
            onToggleListFilter={() => {
              setApplyListFilter((prev) => !prev);
              setPage(1);
            }}
            onAttributeFiltersChange={(filters) => {
              setAttributeFilters(filters);
              setPage(1);
            }}
          />
          </div>

          {/* Desktop: Selection action bar (smart actions + copy) */}
          {hasSelection && (
            <div className="hidden shrink-0 rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/30 md:block">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {selectedWordIds.size}{" "}
                  {selectedWordIds.size === 1 ? "woord" : "woorden"} geselecteerd
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedWordIds((prev) => {
                        const next = new Set(prev);
                        wordResults.forEach((word) => next.add(word.id));
                        return next;
                      });
                    }}
                    className="text-xs font-semibold text-slate-600 hover:underline dark:text-slate-300"
                  >
                    Selecteer zichtbare
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedWordIds(new Set())}
                    className="text-xs font-semibold text-slate-600 hover:underline dark:text-slate-300"
                  >
                    Deselecteer
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {selectedList?.type === "user" && selectedNotInTargetCount > 0 && (
                  <button
                    type="button"
                    disabled={copyBusy}
                    onClick={async () => {
                      if (!selectedList) return;
                      setActionMessage(null);
                      setCopyBusy(true);
                      try {
                        const ids = selectedIds.filter((id) => !membershipSet.has(id));
                        const { error } = await addWordsToUserList(selectedList.id, ids);
                        if (error) {
                          setActionMessage("Kon woorden niet toevoegen.");
                        } else {
                          setActionMessage("Woorden toegevoegd aan lijst.");
                          setSelectedWordIds(new Set());
                          await reloadLists();
                          notifyListsUpdated();
                          if (applyListFilter) await runSearch();
                        }
                      } finally {
                        setCopyBusy(false);
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/15">
                      +
                    </span>
                    Voeg toe aan {selectedList.name} ({selectedNotInTargetCount})
                  </button>
                )}

                {selectedList?.type === "user" && selectedInTargetCount > 0 && (
                  <button
                    type="button"
                    disabled={copyBusy}
                    onClick={async () => {
                      if (!selectedList) return;
                      setActionMessage(null);
                      const confirmed = window.confirm(
                        "Verwijder geselecteerde woorden uit deze lijst?"
                      );
                      if (!confirmed) return;
                      setCopyBusy(true);
                      try {
                        const ids = selectedIds.filter((id) => membershipSet.has(id));
                        const { error } = await removeWordsFromUserList(
                          selectedList.id,
                          ids
                        );
                        if (error) {
                          setActionMessage("Kon woorden niet verwijderen.");
                        } else {
                          setActionMessage("Woorden verwijderd uit lijst.");
                          setSelectedWordIds(new Set());
                          await runSearch();
                          await reloadLists();
                          notifyListsUpdated();
                        }
                      } finally {
                        setCopyBusy(false);
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60 dark:border-red-900/60"
                  >
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/15">
                      −
                    </span>
                    Verwijder van {selectedList.name} ({selectedInTargetCount})
                  </button>
                )}

                {userLists.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCopyDialogOpen(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <svg
                      className="h-4 w-4 text-slate-500 dark:text-slate-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Kopieer naar andere lijst…
                  </button>
                )}
              </div>

              {actionMessage ? (
                <div className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  {actionMessage}
                </div>
              ) : null}
              {listsError ? (
                <div className="mt-2 text-xs text-red-600 dark:text-red-300">
                  {listsError}
                </div>
              ) : null}
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto">
              {/* Mobile: List picker and toolbar scroll with the list */}
              <div className="block space-y-3 p-3 md:hidden">
                {/* Mobile list picker */}
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-800 dark:text-white">
                      Lijst
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCopyNewListName("Nieuwe lijst");
                          setCopyNewListDescription("");
                          setCopyTargetMode("new");
                          setCopyTargetListId(null);
                          setCopyDialogOpen(true);
                        }}
                        className="text-xs font-semibold text-primary hover:underline dark:text-primary-light"
                      >
                        Nieuwe lijst
                      </button>
                      <button
                        type="button"
                        onClick={() => setMobileListPickerOpen(true)}
                        className="text-xs font-semibold text-slate-600 hover:underline dark:text-slate-300"
                      >
                        Wijzig lijst
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Actieve lijst
                      </div>
                      <div className="truncate font-semibold">
                        {selectedList?.name ?? selectedListName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMobileListPickerOpen(true)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Kies
                    </button>
                  </div>
                </div>

                {/* Mobile toolbar */}
                <WordsToolbar
                  applyListFilter={applyListFilter}
                  selectedListName={selectedListName}
                  selectedListId={selectedListId}
                  wordTotal={wordTotal}
                  selectedCount={selectedWordIds.size}
                  query={query}
                  partOfSpeech={partOfSpeech}
                  nt2Only={nt2Only}
                  selectedList={selectedList}
                  autoFocusQuery={autoFocusQuery}
                  isLocked={isLocked}
                  maxAllowed={maxAllowed}
                  attributeFilters={attributeFilters}
                  onQueryChange={(value) => {
                    setQuery(value);
                    setPage(1);
                  }}
                  onPartOfSpeechChange={(value) => {
                    setPartOfSpeech(value);
                    setPage(1);
                  }}
                  onNt2OnlyChange={(value) => {
                    if (value) {
                      setAttributeFilters((prev) =>
                        prev.includes("nt2-2k") ? prev : [...prev, "nt2-2k"]
                      );
                    } else {
                      setAttributeFilters((prev) => prev.filter((f) => f !== "nt2-2k"));
                    }
                    setPage(1);
                  }}
                  onToggleListFilter={() => {
                    setApplyListFilter((prev) => !prev);
                    setPage(1);
                  }}
                  onAttributeFiltersChange={(filters) => {
                    setAttributeFilters(filters);
                    setPage(1);
                  }}
                />

                {/* Mobile selection bar */}
                {hasSelection && (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/30">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {selectedWordIds.size}{" "}
                        {selectedWordIds.size === 1 ? "woord" : "woorden"} geselecteerd
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWordIds((prev) => {
                              const next = new Set(prev);
                              wordResults.forEach((word) => next.add(word.id));
                              return next;
                            });
                          }}
                          className="text-xs font-semibold text-slate-600 hover:underline dark:text-slate-300"
                        >
                          Selecteer zichtbare
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedWordIds(new Set())}
                          className="text-xs font-semibold text-slate-600 hover:underline dark:text-slate-300"
                        >
                          Deselecteer
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedList?.type === "user" && selectedNotInTargetCount > 0 && (
                        <button
                          type="button"
                          disabled={copyBusy}
                          onClick={async () => {
                            if (!selectedList) return;
                            setActionMessage(null);
                            setCopyBusy(true);
                            try {
                              const ids = selectedIds.filter((id) => !membershipSet.has(id));
                              const { error } = await addWordsToUserList(selectedList.id, ids);
                              if (error) {
                                setActionMessage("Kon woorden niet toevoegen.");
                              } else {
                                setActionMessage("Woorden toegevoegd aan lijst.");
                                setSelectedWordIds(new Set());
                                await reloadLists();
                                notifyListsUpdated();
                                if (applyListFilter) await runSearch();
                              }
                            } finally {
                              setCopyBusy(false);
                            }
                          }}
                          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/15">
                            +
                          </span>
                          Voeg toe aan {selectedList.name} ({selectedNotInTargetCount})
                        </button>
                      )}

                      {selectedList?.type === "user" && selectedInTargetCount > 0 && (
                        <button
                          type="button"
                          disabled={copyBusy}
                          onClick={async () => {
                            if (!selectedList) return;
                            setActionMessage(null);
                            const confirmed = window.confirm(
                              "Verwijder geselecteerde woorden uit deze lijst?"
                            );
                            if (!confirmed) return;
                            setCopyBusy(true);
                            try {
                              const ids = selectedIds.filter((id) => membershipSet.has(id));
                              const { error } = await removeWordsFromUserList(
                                selectedList.id,
                                ids
                              );
                              if (error) {
                                setActionMessage("Kon woorden niet verwijderen.");
                              } else {
                                setActionMessage("Woorden verwijderd uit lijst.");
                                setSelectedWordIds(new Set());
                                await runSearch();
                                await reloadLists();
                                notifyListsUpdated();
                              }
                            } finally {
                              setCopyBusy(false);
                            }
                          }}
                          className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60 dark:border-red-900/60"
                        >
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/15">
                            −
                          </span>
                          Verwijder van {selectedList.name} ({selectedInTargetCount})
                        </button>
                      )}

                      {userLists.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCopyDialogOpen(true)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <svg
                            className="h-4 w-4 text-slate-500 dark:text-slate-400"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          Kopieer naar andere lijst…
                        </button>
                      )}
                    </div>

                    {actionMessage ? (
                      <div className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        {actionMessage}
                      </div>
                    ) : null}
                    {listsError ? (
                      <div className="mt-2 text-xs text-red-600 dark:text-red-300">
                        {listsError}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {searchLoading ? (
                <div className="p-4">
                  <div className="space-y-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-10 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
                      />
                    ))}
                  </div>
                </div>
              ) : wordResults.length === 0 ? (
                <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <svg
                      className="h-6 w-6"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                  </div>
                  <div className="text-base font-semibold text-slate-900 dark:text-white">
                    {applyListFilter && selectedList
                      ? "Deze lijst is leeg."
                      : "Geen woorden gevonden."}
                  </div>
                  <div className="max-w-[520px] text-sm text-slate-600 dark:text-slate-300">
                    {applyListFilter && selectedList
                      ? "Schakel ‘Filter door lijst’ uit om alle woorden te bekijken, of voeg woorden toe via een eigen lijst."
                      : "Pas je zoekopdracht aan of wis filters om meer resultaten te zien."}
                  </div>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {(query.trim() || partOfSpeech || attributeFilters.length > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuery("");
                          setPartOfSpeech("");
                          setAttributeFilters([]);
                          setPage(1);
                        }}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Wis filters
                      </button>
                    )}
                    {applyListFilter && selectedListId && (
                      <button
                        type="button"
                        onClick={() => {
                          setApplyListFilter(false);
                          setPage(1);
                        }}
                        className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
                      >
                        Toon alle woorden
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="block md:hidden">
                    <WordsListMobile
                      items={wordResults}
                      selectedIds={selectedWordIds}
                      onToggleSelected={toggleSelected}
                      onOpenDetails={(entry) => setDetailEntry(entry)}
                    />
                  </div>

                  <div className="hidden md:block">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                        <tr>
                          <th className="w-12 px-4 py-3 text-center">Kies</th>
                          <th className="px-4 py-3">Hoofdwoord</th>
                          <th className="px-4 py-3">Woordsoort</th>
                          <th className="w-28 px-4 py-3 text-center">VanDale 2k</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {wordResults.map((word) => {
                          const checked = selectedWordIds.has(word.id);
                          return (
                            <tr
                              key={word.id}
                              className={`group cursor-pointer transition ${
                                checked
                                  ? "bg-primary/5"
                                  : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                              }`}
                              onClick={() => setDetailEntry(word)}
                            >
                              <td
                                className="w-12 px-4 py-3 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSelected(word.id)}
                                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-600 dark:text-primary-light"
                                />
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">
                                {word.headword}
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {word.part_of_speech ?? "—"}
                              </td>
                              <td className="w-20 px-4 py-3 text-center text-slate-600 dark:text-slate-300">
                                {word.is_nt2_2000 ? "Ja" : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            {/* Pagination footer */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <span>
                Toon {wordResults.length ? (page - 1) * pageSize + 1 : 0}-
                {Math.min(wordTotal, page * pageSize)} van {wordTotal}
                {maxAllowed !== null && maxAllowed !== undefined && wordTotal > maxAllowed && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    (beperkt tot {maxAllowed})
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                >
                  Vorige
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Block pagination if we'd exceed the free tier limit
                    const nextPageStart = page * pageSize;
                    const wouldExceedLimit = maxAllowed !== null && maxAllowed !== undefined && nextPageStart >= maxAllowed;
                    if (!wouldExceedLimit && page * pageSize < wordTotal) {
                      setPage((prev) => prev + 1);
                    }
                  }}
                  disabled={
                    page * pageSize >= wordTotal ||
                    (maxAllowed !== null && maxAllowed !== undefined && page * pageSize >= maxAllowed)
                  }
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                >
                  Volgende
                </button>
              </div>
            </div>

            {/* Free tier upgrade CTA */}
            {isLocked && (
              <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                      Je hebt de gratis limiet bereikt
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Upgrade naar premium voor volledige toegang tot alle {wordTotal} woorden.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
                  >
                    Upgrade naar Premium
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Copy dialog */}
          {copyDialogOpen && (
            <div className="fixed inset-0 z-50">
              <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={() => setCopyDialogOpen(false)}
              />
              <div className="absolute left-1/2 top-1/2 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    Kopieer naar andere lijst
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                    Selecteer de doellijst voor {selectedWordIds.size}{" "}
                    {selectedWordIds.size === 1 ? "woord" : "woorden"}.
                  </div>
                </div>
                <div className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap gap-3">
                    <select
                      value={copyTargetMode === "new" ? "__new__" : copyTargetListId ?? ""}
                      onChange={(event) => {
                        if (event.target.value === "__new__") {
                          setCopyTargetMode("new");
                          setCopyTargetListId(null);
                          return;
                        }
                        setCopyTargetMode("existing");
                        setCopyTargetListId(event.target.value || null);
                      }}
                      className="min-w-[240px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="" disabled>
                        Selecteer een lijst…
                      </option>
                      <option value="__new__">Nieuwe lijst aanmaken…</option>
                      {userLists
                        .filter((l) => l.id !== selectedListId)
                        .map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name} ({list.item_count ?? "—"})
                          </option>
                        ))}
                    </select>
                  </div>

                  {copyTargetMode === "new" && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        type="text"
                        value={copyNewListName}
                        onChange={(e) => setCopyNewListName(e.target.value)}
                        placeholder="Nieuwe lijstnaam"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="text"
                        value={copyNewListDescription}
                        onChange={(e) => setCopyNewListDescription(e.target.value)}
                        placeholder="Beschrijving (optioneel)"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCopyDialogOpen(false)}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    disabled={copyBusy}
                    onClick={async () => {
                      setActionMessage(null);
                      try {
                        setCopyBusy(true);
                        let targetId =
                          copyTargetMode === "existing" ? copyTargetListId : null;

                        if (!targetId && copyTargetMode === "existing") {
                          setActionMessage("Selecteer een doellijst.");
                          return;
                        }

                        if (copyTargetMode === "new") {
                          if (!copyNewListName.trim()) {
                            setActionMessage("Vul een lijstnaam in.");
                            return;
                          }
                          const created = await createUserList({
                            userId,
                            name: copyNewListName.trim(),
                            description: copyNewListDescription.trim() || undefined,
                            language_code: language,
                          });
                          if (!created?.id) {
                            setActionMessage("Kon geen lijst aanmaken.");
                            return;
                          }
                          targetId = created.id;
                          setCopyTargetMode("existing");
                          setCopyTargetListId(created.id);
                          setCopyNewListName("");
                          setCopyNewListDescription("");
                          await reloadLists();
                          notifyListsUpdated();
                        }

                        if (!targetId) return;

                        const { error } = await addWordsToUserList(targetId, selectedIds);
                        if (error) {
                          setActionMessage("Kon woorden niet kopiëren.");
                          return;
                        }
                        setActionMessage("Woorden gekopieerd.");
                        setSelectedWordIds(new Set());
                        await reloadLists();
                        notifyListsUpdated();
                        setCopyDialogOpen(false);
                      } finally {
                        setCopyBusy(false);
                      }
                    }}
                    className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60"
                  >
                    Kopieer
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <MobileListPickerSheet
        open={mobileListPickerOpen}
        onClose={() => setMobileListPickerOpen(false)}
        language={language}
        onLanguageChange={onLanguageChange}
        curatedLists={curatedLists}
        userLists={userLists}
        selectedListId={selectedListId}
        onSelectList={(list) => {
          setSelectedListId(list.id);
          setSelectedWordIds(new Set());
          setActionMessage(null);
          onListChange(list);
        }}
      />

      <WordDetailDrawer
        open={Boolean(detailEntry)}
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
        userId={userId}
        translationLang={translationLang}
        selectedListName={selectedListName}
        userLists={userLists}
        onListsUpdated={async () => {
          await reloadLists();
          notifyListsUpdated();
        }}
        onTrainWord={onTrainWord}
      />
    </div>
  );
}
