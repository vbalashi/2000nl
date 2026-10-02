"use client";

import React, { useEffect, useState } from "react";

type Props = {
  dictionaryId: string;
  groupKeys: string[];
  userIds: string[];
  onSaved: (groupKeys: string[], userIds: string[]) => void;
};

export function PublicationAudienceControls({ dictionaryId, groupKeys, userIds, onSaved }: Props) {
  const [groups, setGroups] = useState(groupKeys);
  const [users, setUsers] = useState(userIds);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [options, setOptions] = useState<{ groups: { key: string; name: string }[]; users: { id: string; email: string }[]; hasMoreUsers: boolean }>({ groups: [], users: [], hasMoreUsers: false });
  useEffect(() => {
    setOptionsLoading(true);
    setOptionsError(false);
    void fetch(`/api/admin/dictionary-audience-options?page=${page}`).then((response) => response.ok ? response.json() : null).then((value) => { if (value) setOptions(value); else setOptionsError(true); }).catch(() => setOptionsError(true)).finally(() => setOptionsLoading(false));
  }, [page]);
  const save = async () => {
    setBusy(true); setSaveError(false);
    try {
      const nextGroups = groups;
      const nextUsers = users;
      const response = await fetch(`/api/admin/dictionaries/${encodeURIComponent(dictionaryId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupKeys: nextGroups, userIds: nextUsers }),
      });
      if (!response.ok) throw new Error();
      onSaved(nextGroups, nextUsers);
    } catch { setSaveError(true); } finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="mb-3 text-base font-semibold">Аудитория restricted-доступа</h2>
    <p className="mb-4 text-sm leading-6 text-slate-600">Выберите группы и пользователей. Эти grants не меняют Premium и не открывают словарь при состоянии «Для всех».</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <fieldset><legend className="text-xs font-medium text-slate-600">Группы</legend><div className="mt-2 space-y-2">{options.groups.map((option) => <label key={option.key} className="flex items-center gap-2 text-sm"><input aria-label={option.name} type="checkbox" checked={groups.includes(option.key)} onChange={(event) => setGroups((current) => event.target.checked ? [...new Set([...current, option.key])] : current.filter((value) => value !== option.key))} />{option.name} <span className="text-xs text-slate-500">({option.key})</span></label>)}</div></fieldset>
      <fieldset><legend className="text-xs font-medium text-slate-600">Пользователи</legend><div className="mt-2 max-h-40 space-y-2 overflow-auto">{optionsLoading ? <p className="text-xs text-slate-500">Загрузка пользователей…</p> : options.users.map((option) => <label key={option.id} className="flex items-center gap-2 text-sm"><input aria-label={option.email} type="checkbox" checked={users.includes(option.id)} onChange={(event) => setUsers((current) => event.target.checked ? [...new Set([...current, option.id])] : current.filter((value) => value !== option.id))} />{option.email}</label>)}</div><div className="mt-3 flex items-center gap-2"><button type="button" className="rounded border px-2 py-1 text-xs disabled:opacity-50" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || optionsLoading}>Назад</button><span className="text-xs text-slate-500">Страница {page}</span><button type="button" className="rounded border px-2 py-1 text-xs disabled:opacity-50" onClick={() => setPage((current) => current + 1)} disabled={!options.hasMoreUsers || optionsLoading}>Дальше</button></div></fieldset>
    </div>
    {optionsError && <p role="alert" className="mt-3 text-sm text-red-700">Не удалось загрузить группы и пользователей. Обновите страницу и попробуйте снова.</p>}
    {saveError && <p role="alert" className="mt-3 text-sm text-red-700">Не удалось сохранить аудиторию.</p>}
    <button type="button" onClick={() => void save()} disabled={busy || optionsLoading || optionsError} className="mt-4 min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white disabled:opacity-50">{busy ? "Сохраняем…" : "Сохранить аудиторию"}</button>
  </section>;
}
