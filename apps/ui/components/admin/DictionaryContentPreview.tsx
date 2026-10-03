"use client";

import React, { useState } from "react";
import type { AdminDictionaryContentEntry, AdminDictionaryContentPage } from "@/lib/admin/dictionaryRepository";

export function DictionaryContentPreview({ dictionaryId }: { dictionaryId: string }) {
  const [page, setPage] = useState<AdminDictionaryContentPage | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"forbidden" | "unavailable" | null>(null);

  const load = async (nextPage: number) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/dictionaries/${encodeURIComponent(dictionaryId)}/content?page=${nextPage}&pageSize=25`,
        { cache: "no-store" },
      );
      if (response.status === 403) {
        setError("forbidden");
        return;
      }
      if (!response.ok) throw new Error("Dictionary content unavailable");
      const result = await response.json() as AdminDictionaryContentPage;
      setPage(result);
      setPageNumber(result.page);
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  };

  return <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">Содержимое словаря</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">Просмотр открывается отдельно и записывается в журнал. Включает личные словари.</p>
      </div>
      {!page && <button type="button" disabled={busy} onClick={() => void load(1)} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-60">{busy ? "Загрузка…" : "Просмотреть содержимое"}</button>}
    </div>

    {error && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error === "forbidden" ? "Нет разрешения на просмотр содержимого словаря." : "Не удалось загрузить содержимое."}</p>}

    {page && <>
      <p className="mt-4 text-sm text-slate-600">Показано {page.items.length} из {page.total} записей. Каждое открытие страницы отражается в журнале.</p>
      {page.items.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">В этом словаре пока нет записей.</p> : <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2.5 font-medium">Слово</th><th className="px-3 py-2.5 font-medium">Часть речи</th><th className="px-3 py-2.5 font-medium">Значение</th><th className="px-3 py-2.5 font-medium">ID записи</th></tr></thead>
          <tbody>{page.items.map((entry: AdminDictionaryContentEntry) => <tr key={entry.id} className="border-t border-slate-100 align-top"><td className="px-3 py-3 font-medium">{entry.headword}<span className="mt-1 block text-xs text-slate-500">{entry.languageCode.toUpperCase()} · #{entry.meaningId ?? "—"}</span></td><td className="px-3 py-3 text-slate-600">{entry.partOfSpeech ?? "Нет данных"}</td><td className="max-w-[480px] whitespace-pre-wrap px-3 py-3">{entry.definition ?? "Нет данных"}</td><td className="max-w-48 break-all px-3 py-3 font-mono text-[11px] text-slate-500">{entry.id}</td></tr>)}</tbody>
        </table>
      </div>}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Страница {pageNumber}</span>
        <div className="flex gap-2">
          {pageNumber > 1 && <button type="button" disabled={busy} onClick={() => void load(pageNumber - 1)} className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-60">Назад</button>}
          {page.hasNext && <button type="button" disabled={busy} onClick={() => void load(pageNumber + 1)} className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-60">Дальше</button>}
        </div>
      </div>
    </>}
  </section>;
}
