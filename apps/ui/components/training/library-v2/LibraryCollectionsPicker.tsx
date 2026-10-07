"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import { DialogSurface } from "@/components/practice/ui/DialogSurface";
import s from "@/components/practice/library/libraryOverlays.module.css";
import { getUiMessages } from "@/lib/uiMessages";
import { Plus, X } from "lucide-react";
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
  membershipState?: "loading" | "ready" | "failed";
  onRetryMemberships?: () => void;
  onClose: () => void;
  onToggleList: (list: WordListSummary, included: boolean) => void;
  onCreateList: (name: string) => void;
  onOpenListMembership?: (membership: EntryLearningListMembership) => void;
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
  membershipState = "ready",
  onRetryMemberships,
  onClose,
  onToggleList,
  onCreateList,
  onOpenListMembership,
}: Props) {
  const editingBlocked = busyListId !== null || membershipState !== "ready";
  const titleId = React.useId();
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const copy = getUiMessages(interfaceLanguage).collections;
  const [newListName, setNewListName] = React.useState("");
  const t = (key: string) => platformV2Message(interfaceLanguage, key);

  React.useEffect(() => {
    if (!open) return;
    setCreating(false);
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

  const createForm = (<form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const name = newListName.trim();
              if (!name || editingBlocked) return;
              onCreateList(name);
              setNewListName("");
            }}
          >
            <input
              value={newListName}
              aria-label={t("senseCard.collections.createPlaceholder")}
              onChange={(event) => setNewListName(event.target.value)}
              placeholder={t("senseCard.collections.createPlaceholder")}
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-[#171b22] dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={!newListName.trim() || editingBlocked}
              className="rounded-xl border border-indigo-500 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50 dark:text-indigo-200"
            >
              {t("senseCard.collections.create")}
            </button>
          </form>);

  const content = (
      <section
        aria-labelledby={titleId}
        className={`${s.sheet} ${s.production}`}
      >
        <header data-dialog-part="heading" className="flex items-start gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="min-w-0 flex-1">
            <p className="sr-only">
              {headword}
            </p>
            <h2
              id={titleId}
              className="mt-1 text-xl font-semibold text-slate-950 dark:text-white"
            >
              {copy.title}
            </h2>
            <p className="sr-only">
              {definition}
            </p>
          </div>
          <button
            type="button"
            aria-label={platformV2Message(interfaceLanguage, "common.close")}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg text-slate-600 transition hover:bg-slate-200 dark:bg-[#171b22] dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <p className={s.hint}>{copy.hint}</p>
        <div data-dialog-part="fields" className="space-y-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <label className="block">
            <span className="sr-only">{t("senseCard.collections.search")}</span>
            <input
              ref={searchRef}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("senseCard.collections.search")}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-[#171b22] dark:text-slate-100"
            />
          </label>
        </div>

        <div data-dialog-part="body" role="region" aria-label={t("senseCard.collections.title")} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {membershipState === "loading" ? <p role="status">{t("senseCard.collections.loadingMembership")}</p> : null}
          {membershipState === "failed" ? <div>
            <p role="alert">{t("senseCard.collections.membershipFailed")}</p>
            {onRetryMemberships ? <button type="button" onClick={onRetryMemberships}>{t("senseCard.collections.retryMembership")}</button> : null}
          </div> : null}
          {visibleLists.length ? (
            <div className="space-y-1">
              {visibleLists.map((list) => {
                const included = membershipIds.has(list.id);
                return (
                  <div
                    key={list.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-100 dark:hover:bg-slate-700/50"
                  >
                    <input
                      id={`library-collection-${list.id}`}
                      type="checkbox"
                      checked={included}
                      disabled={editingBlocked}
                      onChange={() => onToggleList(list, included)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label
                      htmlFor={`library-collection-${list.id}`}
                      className="min-w-0 flex-1"
                    >
                      <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {list.name}
                      </span>
                      {typeof list.item_count === "number" ? (
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {list.item_count} {t("senseCard.collections.items")}
                        </span>
                      ) : null}
                    </label>
                    {included && onOpenListMembership ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          const membership = memberships.find(
                            (item) => item.listId === list.id,
                          );
                          if (membership) onOpenListMembership(membership);
                        }}
                        className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                      >
                        {t("senseCard.collections.open")}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : membershipState === "ready" ? (
            <p className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {t("senseCard.collections.empty")}
            </p>
          ) : null}
        </div>

        <div className={s.creation}>
          {creating ? createForm : <button type="button" disabled={editingBlocked}
            onClick={() => { setNewListName(query); setCreating(true); }}>
            <Plus aria-hidden="true" size={15} />{copy.new}
          </button>}
        </div>

        <footer data-dialog-part="footer" className="flex min-h-12 items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
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
  );
  return <DialogSurface className={s.dialog} lang={interfaceLanguage}
    aria-labelledby={titleId} initialFocusRef={searchRef} onDismiss={onClose}>{content}</DialogSurface>;
}
