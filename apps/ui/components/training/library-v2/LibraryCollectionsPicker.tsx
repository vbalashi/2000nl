"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import type {
  EntryLearningListMembership,
  WordListSummary,
} from "@/lib/types";

type Props = {
  open: boolean;
  headword: string;
  definition: string;
  interfaceLanguage: OnboardingLanguage;
  userLists: WordListSummary[];
  memberships: EntryLearningListMembership[];
  busyListId: string | null;
  status: string | null;
  onClose: () => void;
  onToggleList: (list: WordListSummary, included: boolean) => void;
  onCreateList: (name: string) => void;
};

export function LibraryCollectionsPicker({
  open,
  headword,
  definition,
  interfaceLanguage,
  userLists,
  memberships,
  busyListId,
  status,
  onClose,
  onToggleList,
  onCreateList,
}: Props) {
  const [query, setQuery] = React.useState("");
  const [newListName, setNewListName] = React.useState("");
  const t = (key: string) => platformV2Message(interfaceLanguage, key);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setNewListName("");
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const membershipIds = new Set(
    memberships
      .filter((membership) => membership.listType === "user")
      .map((membership) => membership.listId),
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleLists = userLists.filter(
    (list) =>
      list.type === "user" &&
      (!normalizedQuery ||
        list.name.toLocaleLowerCase().includes(normalizedQuery)),
  );

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-collections-title"
        className="flex max-h-[min(680px,calc(100dvh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-600 dark:bg-[#20252f]"
      >
        <header className="flex items-start gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">
              {headword}
            </p>
            <h2
              id="library-collections-title"
              className="mt-1 text-xl font-semibold text-slate-950 dark:text-white"
            >
              {t("senseCard.collections.title")}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
              {definition}
            </p>
          </div>
          <button
            type="button"
            aria-label={platformV2Message(interfaceLanguage, "common.close")}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg text-slate-600 transition hover:bg-slate-200 dark:bg-[#171b22] dark:text-slate-300 dark:hover:bg-slate-700"
          >
            ×
          </button>
        </header>

        <div className="space-y-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <label className="block">
            <span className="sr-only">{t("senseCard.collections.search")}</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("senseCard.collections.search")}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-[#171b22] dark:text-slate-100"
            />
          </label>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const name = newListName.trim();
              if (!name) return;
              onCreateList(name);
              setNewListName("");
            }}
          >
            <input
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              placeholder={t("senseCard.collections.createPlaceholder")}
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-[#171b22] dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={!newListName.trim() || busyListId !== null}
              className="rounded-xl border border-indigo-500 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50 dark:text-indigo-200"
            >
              {t("senseCard.collections.create")}
            </button>
          </form>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {visibleLists.length ? (
            <div className="space-y-1">
              {visibleLists.map((list) => {
                const included = membershipIds.has(list.id);
                return (
                  <label
                    key={list.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-100 dark:hover:bg-slate-700/50"
                  >
                    <input
                      type="checkbox"
                      checked={included}
                      disabled={busyListId !== null}
                      onChange={() => onToggleList(list, included)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {list.name}
                      </span>
                      {typeof list.item_count === "number" ? (
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {list.item_count} {t("senseCard.collections.items")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {t("senseCard.collections.empty")}
            </p>
          )}
        </div>

        <footer className="flex min-h-12 items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">
            {status}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            {t("common.done")}
          </button>
        </footer>
      </section>
    </div>
  );
}
