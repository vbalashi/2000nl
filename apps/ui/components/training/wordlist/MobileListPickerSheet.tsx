import type { WordListSummary } from "@/lib/types";
import { DropUpSelect } from "../DropUpSelect";

type Props = {
  open: boolean;
  onClose: () => void;
  language: string;
  onLanguageChange: (value: string) => void;
  curatedLists: WordListSummary[];
  userLists: WordListSummary[];
  selectedListId: string | null;
  onSelectList: (list: WordListSummary) => void;
};

export function MobileListPickerSheet({
  open,
  onClose,
  language,
  onLanguageChange,
  curatedLists,
  userLists,
  selectedListId,
  onSelectList,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              Selecteer lijst
            </div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">
              Kies een lijst om woorden toe te voegen of te verwijderen.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full border border-slate-200 text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <span className="sr-only">Sluit</span>
            <svg
              className="mx-auto h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
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

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <p className="text-sm font-semibold text-slate-800 dark:text-white">
              Kant-en-klare lijsten
            </p>
            <div className="mt-3 space-y-2">
              {curatedLists.map((list) => {
                const isActive = list.id === selectedListId;
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => {
                      onSelectList(list);
                      onClose();
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

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <p className="text-sm font-semibold text-slate-800 dark:text-white">
              Je lijsten
            </p>
            <div className="mt-3 space-y-2">
              {userLists.map((list) => {
                const isActive = list.id === selectedListId;
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => {
                      onSelectList(list);
                      onClose();
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
                  Nog geen eigen lijsten.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

