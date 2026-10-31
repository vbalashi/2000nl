"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdmissionAction, AdmissionMode, AdmissionPage, AdmissionRow } from "@/lib/admission/contract";
const modes: Record<AdmissionMode, string> = { "invite-only": "По приглашениям", "approval-required": "После одобрения", open: "Свободный вход" };
const statuses: Record<string, string> = { pending: "Ожидает", approved: "Допущен", rejected: "Отклонён", revoked: "Доступ отозван" };
export function AdmissionPanel() {
  const [data, setData] = useState<AdmissionPage | null>(null);
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<AdmissionMode>("invite-only");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const working = busy || loading;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    const requestId = ++generation.current; setLoading(true); setSelected([]);
    try {
    const response = await fetch(`/api/admin/admission?${new URLSearchParams({ status, page: String(page), q: query })}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось загрузить заявки");
    const next = await response.json() as AdmissionPage;
    if (requestId !== generation.current) return;
    setData(next); setMode(next.mode); setSelected([]);
    } finally { if (requestId === generation.current) setLoading(false); }
  }, [status, page, query]);
  useEffect(() => { void reload().catch(() => setError("Не удалось загрузить заявки. Попробуйте обновить.")); }, [reload]);
  async function decide(action: AdmissionAction, emails: string[] = []) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/admission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, emails, mode }) });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { error?: string } | null;
        if (detail?.error === "forbidden_origin") {
          setError("Сохранение отклонено: адрес админки не совпадает с настройкой сервера. Обратитесь к администратору."); return;
        }
        if (response.status === 401 || response.status === 403) {
          setError("Сохранение отклонено. Проверьте вход в админку и права управления допуском."); return;
        }
        throw new Error("Не удалось сохранить решение");
      }
      const result = await response.json() as { results?: { outcome: string }[] };
      const results = result.results ?? [];
      setMessage(action === "mode" ? "Режим сохранён. Ранее выданный доступ сохраняется." : `Изменено: ${results.filter(r => r.outcome === "changed").length}; без изменений: ${results.filter(r => r.outcome === "unchanged").length}; не найдено: ${results.filter(r => r.outcome === "not_found").length}.`);
      setEmail("");
      await reload().catch(() => setError("Решение сохранено, но список не обновился. Нажмите «Обновить заявки»."));
    } catch { setError("Не удалось подтвердить результат. Обновите список перед повтором."); }
    finally { setBusy(false); }
  }
  const items = data?.items.slice(0, 50) ?? [];
  function selection(row: AdmissionRow, checked: boolean) { setSelected(previous => checked ? [...new Set([...previous, row.email])] : previous.filter(e => e !== row.email)); }
  return <section aria-label="Допуск пользователей" className="mb-8 space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <h2 className="text-lg font-semibold">Допуск пользователей</h2>
    <p className="text-sm text-slate-600">Подтверждение Google или email создаёт заявку. Решение о доступе принимается отдельно.</p>
    {data && !data.enabled && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Ограничение ещё не включено для этой среды. Решения можно подготовить; включение выполняется при запуске среды.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    <fieldset disabled={working || !data} className="flex flex-wrap items-end gap-3 disabled:opacity-60">
      <label className="text-sm">Режим входа<select aria-label="Режим входа" value={mode} onChange={e => setMode(e.target.value as AdmissionMode)} className="ml-2 rounded border p-2">{Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button type="button" disabled={mode === data?.mode} onClick={() => void decide("mode")} className="rounded border px-3 py-2 text-sm disabled:opacity-40">Сохранить режим</button>
    </fieldset>
    <form onSubmit={e => { e.preventDefault(); void decide("invite", [email]); }} className="flex flex-wrap gap-2">
      <label className="flex-1 text-sm">Заранее разрешить доступ по email<input aria-label="Email приглашённого" type="email" required maxLength={320} value={email} onChange={e => setEmail(e.target.value)} disabled={working} className="mt-1 block w-full rounded border p-2" /></label>
      <button disabled={working || !email.trim() || !data} className="self-end rounded bg-primary px-3 py-2 text-sm text-white disabled:opacity-40">Разрешить этот email</button>
    </form>
    <p className="text-xs text-slate-500">Доступ получит только владелец этого подтверждённого адреса. Эта кнопка не отправляет письмо.</p>
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">Статус<select aria-label="Статус допуска" disabled={working} value={status} onChange={e => { setStatus(e.target.value); setPage(1); setSelected([]); }} className="ml-2 rounded border p-2"><option value="">Все</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm">Поиск по email<input aria-label="Поиск заявок по email" value={query} disabled={working} onChange={e => { setQuery(e.target.value); setPage(1); setSelected([]); }} maxLength={128} className="ml-2 rounded border p-2" /></label>
      <button disabled={working} onClick={() => void reload().catch(() => setError("Не удалось обновить список"))} className="rounded border px-3 text-sm">Обновить заявки</button>
    </div>
    <div className="flex flex-wrap gap-2">
      <button disabled={working || !selected.length} onClick={() => void decide("approve", selected)} className="rounded bg-primary px-3 py-2 text-sm text-white disabled:opacity-40">Одобрить выбранных ({selected.length})</button>
      <button disabled={working || !selected.length} onClick={() => void decide("reject", selected)} className="rounded border px-3 py-2 text-sm disabled:opacity-40">Отклонить выбранных</button>
    </div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2"><input type="checkbox" aria-label="Выбрать видимую страницу" disabled={working || !items.length} checked={!!items.length && items.every(r => selected.includes(r.email))} onChange={e => setSelected(e.target.checked ? items.map(r => r.email) : [])} /></th><th>Email</th><th>Статус</th><th>Решение</th></tr></thead><tbody>{items.map(row => <tr key={row.email} className="border-t"><td className="p-2"><input type="checkbox" aria-label={`Выбрать ${row.email}`} disabled={working} checked={selected.includes(row.email)} onChange={e => selection(row, e.target.checked)} /></td><td className="break-all p-2">{row.email}</td><td className="p-2">{statuses[row.status] ?? row.status}</td><td className="p-2"><div className="flex flex-wrap gap-2">{row.status !== "approved" && <button disabled={working} onClick={() => void decide("approve", [row.email])} className="rounded border p-2">Одобрить</button>}{row.status === "pending" && <button disabled={working} onClick={() => void decide("reject", [row.email])} className="rounded border p-2">Отклонить</button>}{row.status === "approved" && <button disabled={working} onClick={() => void decide("revoke", [row.email])} className="rounded border p-2 text-red-700">Отозвать доступ</button>}</div></td></tr>)}</tbody></table></div>
    {data && !items.length && <p className="text-sm text-slate-500">Заявок с таким фильтром нет.</p>}
    <div className="flex items-center gap-3 text-sm"><button disabled={working || page === 1} onClick={() => { setPage(p => p - 1); setSelected([]); }} className="rounded border p-2 disabled:opacity-40">Назад</button><span>Страница {page}</span><button disabled={working || !data || data.items.length <= 50} onClick={() => { setPage(p => p + 1); setSelected([]); }} className="rounded border p-2 disabled:opacity-40">Далее</button></div>
  </section>;
}
