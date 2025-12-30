import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addWordsToUserList,
  createUserList,
  fetchWordsForList,
  removeWordsFromUserList,
  searchWordEntries,
  deleteUserList,
} from "@/lib/trainingService";
import type { DictionaryEntry, WordListSummary, WordListType } from "@/lib/types";
import { DropUpSelect } from "../DropUpSelect";
import { BulkActionBar } from "./BulkActionBar";
import { WordsToolbar } from "./WordsToolbar";
import { WordsListMobile } from "./WordsListMobile";
import { WordDetailDrawer } from "./WordDetailDrawer";

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
};

export function WordListTab({
  open,
  userId,
  language,
  onLanguageChange,
  translationLang,
  wordListType,
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
}: Props) {
  const [query, setQuery] = useState("");
  const [partOfSpeech, setPartOfSpeech] = useState("");
  const [nt2Only, setNt2Only] = useState(false);
  const [wordResults, setWordResults] = useState<DictionaryEntry[]>([]);
  const [wordTotal, setWordTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [searchLoading, setSearchLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "search">("list");
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(
    new Set()
  );
  const [detailEntry, setDetailEntry] = useState<DictionaryEntry | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [addTargetMode, setAddTargetMode] = useState<"existing" | "new">(
    "existing"
  );
  const [addTargetListId, setAddTargetListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [savingList, setSavingList] = useState(false);
  const [deletingList, setDeletingList] = useState(false);

  useEffect(() => {
    if (addTargetMode === "existing" && !addTargetListId && userLists.length > 0) {
      setAddTargetListId(userLists[0].id);
    }
  }, [userLists, addTargetListId, addTargetMode]);

  const runSearch = useCallback(async () => {
    if (!open) return;
    setSearchLoading(true);
    const searchingList = viewMode === "list" && selectedListId;

    if (viewMode === "list" && !selectedListId) {
      setWordResults([]);
      setWordTotal(0);
      setSearchLoading(false);
      return;
    }

    const result = searchingList
      ? await fetchWordsForList(selectedListId!, wordListType ?? "curated", {
          query: query || undefined,
          partOfSpeech: partOfSpeech || undefined,
          page,
          pageSize,
        })
      : await searchWordEntries({
          query: query || undefined,
          partOfSpeech: partOfSpeech || undefined,
          isNt2: nt2Only ? true : undefined,
          page,
          pageSize,
        });

    setWordResults(result.items);
    setWordTotal(result.total);
    setSearchLoading(false);
  }, [
    open,
    viewMode,
    selectedListId,
    wordListType,
    query,
    partOfSpeech,
    nt2Only,
    page,
    pageSize,
  ]);

  useEffect(() => {
    if (!open) return;
    void runSearch();
  }, [runSearch, open]);

  const hasSelection = selectedWordIds.size > 0;
  const selectedIds = useMemo(() => Array.from(selectedWordIds), [selectedWordIds]);

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
    <div className="relative flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap gap-3">
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

      <div className="grid min-h-0 flex-1 gap-6 md:grid-cols-[320px,1fr]">
        <aside className="hidden min-h-0 md:block">
          <div className="h-full overflow-y-auto pr-1">
            <div className="space-y-4">
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
                          setViewMode("list");
                          setPage(1);
                          setQuery("");
                          setPartOfSpeech("");
                          setNt2Only(false);
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
                            <span className="text-[10px] uppercase text-primary">
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
                        setNewListName("Nieuwe lijst");
                        setViewMode("search");
                        setAddTargetMode("new");
                        setAddTargetListId(null);
                      }}
                      className="text-xs font-semibold text-primary hover:underline"
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
                            setAddTargetListId(null);
                            setViewMode("list");
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
                          setViewMode("list");
                          setPage(1);
                          setQuery("");
                          setPartOfSpeech("");
                          setNt2Only(false);
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
                            <span className="text-[10px] uppercase text-primary">
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

        <section className="flex min-h-0 flex-col gap-4">
          <div className="block md:hidden">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-800 dark:text-white">
                  Lijst
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewListName("Nieuwe lijst");
                      setViewMode("search");
                      setAddTargetMode("new");
                      setAddTargetListId(null);
                    }}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Nieuwe lijst
                  </button>
                </div>
              </div>

              <select
                value={selectedListId ?? ""}
                onChange={(event) => {
                  const nextId = event.target.value || null;
                  if (!nextId) return;
                  const found =
                    curatedLists.find((l) => l.id === nextId) ??
                    userLists.find((l) => l.id === nextId) ??
                    null;
                  if (!found) return;
                  setSelectedListId(found.id);
                  setViewMode("list");
                  setPage(1);
                  setQuery("");
                  setPartOfSpeech("");
                  setNt2Only(false);
                  setSelectedWordIds(new Set());
                  setActionMessage(null);
                  onListChange(found);
                }}
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="" disabled>
                  Kies lijst…
                </option>
                {curatedLists.length ? (
                  <optgroup label="Kant-en-klare lijsten">
                    {curatedLists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.item_count ?? "—"})
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {userLists.length ? (
                  <optgroup label="Je lijsten">
                    {userLists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.item_count ?? "—"})
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </div>
          </div>

          <WordsToolbar
            viewMode={viewMode}
            selectedListName={selectedListName}
            wordTotal={wordTotal}
            selectedCount={selectedWordIds.size}
            query={query}
            partOfSpeech={partOfSpeech}
            nt2Only={nt2Only}
            selectedList={selectedList}
            onQueryChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            onPartOfSpeechChange={(value) => {
              setPartOfSpeech(value);
              setPage(1);
            }}
            onNt2OnlyChange={(value) => {
              setNt2Only(value);
              setPage(1);
            }}
            onNewSearch={() => {
              setViewMode("search");
              setSelectedWordIds(new Set());
              setPage(1);
              setActionMessage(null);
            }}
            onBackToList={() => {
              setViewMode("list");
              setSelectedWordIds(new Set());
              setPage(1);
              setActionMessage(null);
              void runSearch();
            }}
          />

          <BulkActionBar
            visible={hasSelection}
            selectedCount={selectedWordIds.size}
            canSelectVisible={wordResults.length > 0}
            onSelectVisible={() => {
              setSelectedWordIds((prev) => {
                const next = new Set(prev);
                wordResults.forEach((word) => next.add(word.id));
                return next;
              });
            }}
            canClear={hasSelection}
            onClear={() => setSelectedWordIds(new Set())}
            canDelete={
              viewMode === "list" &&
              Boolean(selectedList) &&
              selectedList?.type === "user" &&
              selectedWordIds.size > 0
            }
            onDelete={async () => {
              setActionMessage(null);
              if (!selectedList) return;
              if (viewMode !== "list") return;
              if (selectedList.type !== "user") {
                setActionMessage("Alleen eigen lijsten kunnen bewerkt worden.");
                return;
              }
              if (!selectedIds.length) {
                setActionMessage("Selecteer eerst woorden uit de lijst.");
                return;
              }
              const confirmed = window.confirm(
                "Verwijder geselecteerde woorden uit deze lijst?"
              );
              if (!confirmed) return;
              const { error } = await removeWordsFromUserList(
                selectedList.id,
                selectedIds
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
            }}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="min-h-0 flex-1 overflow-y-auto">
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
                <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-300">
                  {viewMode === "list"
                    ? "Deze lijst is leeg."
                    : "Geen woorden gevonden."}
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
                                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-600"
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
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <span>
                Toon {wordResults.length ? (page - 1) * pageSize + 1 : 0}-
                {Math.min(wordTotal, page * pageSize)} van {wordTotal}
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
                    if (page * pageSize < wordTotal) {
                      setPage((prev) => prev + 1);
                    }
                  }}
                  disabled={page * pageSize >= wordTotal}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                >
                  Volgende
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="flex flex-wrap gap-3">
              <select
                value={addTargetMode === "new" ? "__new__" : addTargetListId ?? ""}
                onChange={(event) =>
                  event.target.value === "__new__"
                    ? (setAddTargetMode("new"), setAddTargetListId(null))
                    : (setAddTargetMode("existing"),
                      setAddTargetListId(
                        event.target.value ? event.target.value : null
                      ))
                }
                className="min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Kies bestaande lijst</option>
                <option value="__new__">Nieuwe lijst aanmaken</option>
                {userLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newListName}
                onChange={(event) => {
                  setNewListName(event.target.value);
                  if (event.target.value.trim().length > 0) {
                    setAddTargetMode("new");
                  }
                }}
                placeholder="Nieuwe lijstnaam"
                className="flex-1 min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                value={newListDescription}
                onChange={(event) => setNewListDescription(event.target.value)}
                placeholder="Beschrijving (optioneel)"
                className="flex-1 min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                disabled={savingList}
                onClick={async () => {
                  setActionMessage(null);
                  const ids = Array.from(selectedWordIds);
                  if (!ids.length) {
                    setActionMessage("Selecteer eerst woorden.");
                    return;
                  }

                  let targetId =
                    addTargetMode === "existing" ? addTargetListId : null;

                  if (!targetId && !newListName.trim()) {
                    setActionMessage(
                      "Kies een bestaande lijst of vul een nieuwe naam in."
                    );
                    return;
                  }

                  try {
                    setSavingList(true);

                    if (!targetId) {
                      const created = await createUserList({
                        userId,
                        name: newListName.trim(),
                        description: newListDescription.trim() || undefined,
                        language_code: language,
                      });

                      if (!created?.id) {
                        setActionMessage("Kon geen lijst aanmaken.");
                        setSavingList(false);
                        return;
                      }
                      targetId = created.id;
                      setAddTargetMode("existing");
                      setAddTargetListId(created.id);
                      setNewListName("");
                      setNewListDescription("");
                      await reloadLists();
                      notifyListsUpdated();
                    }

                    const { error } = await addWordsToUserList(targetId, ids);

                    if (error) {
                      setActionMessage("Kon woorden niet toevoegen.");
                    } else {
                      setActionMessage("Woorden toegevoegd aan lijst.");
                      setSelectedWordIds(new Set());
                      await reloadLists();
                      notifyListsUpdated();
                    }
                  } finally {
                    setSavingList(false);
                  }
                }}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60"
              >
                Voeg toe aan lijst
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Selecteer woorden (of gebruik &ldquo;Selecteer zichtbare&rdquo;), kies
              een bestaande lijst of vul een nieuwe naam in en voeg ze toe.
            </p>
            {actionMessage ? (
              <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {actionMessage}
              </p>
            ) : null}
            {listsError ? (
              <p className="mt-2 text-xs text-red-500">{listsError}</p>
            ) : null}
          </div>
        </section>
      </div>

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

