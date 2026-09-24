"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  FileClock,
  Filter,
  LogOut,
  Menu,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import type { DictionaryMetadata, DictionaryRegistryPage, DictionaryRegistryRow } from "@/lib/admin/dictionaryContract";
import type { AdminAuditAction, AdminAuditEvent } from "@/lib/admin/auditContract";

type View = "login" | "dictionaries" | "detail" | "journal";
type LocationState = {
  view: View;
  id: string;
  q: string;
  language: string;
  kind: string;
  page: number;
  pageSize: number;
  period: number;
  action: string;
  state: string;
  before: string;
};
type ApiPage<T> = { items: T[]; hasNext: boolean; page: number; pageSize: number; before?: string };

const blankPage: DictionaryRegistryPage = { items: [], hasNext: false, page: 1, pageSize: 25, hasPrevious: false, returned: 0 };
const date = (value: string | null) => value
  ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Нет данных";
const kindLabel = (kind: DictionaryRegistryRow["kind"]) => kind === "curated" ? "Кураторский" : kind === "user" ? "Пользовательский" : "Нет данных";
const targetLabel = (item: AdminAuditEvent) => item.target || "Нет данных";
const actionOptions: Array<{ value: AdminAuditAction | ""; label: string }> = [
  { value: "", label: "Все действия" },
  { value: "auth.sign_in", label: "Вход" },
  { value: "auth.sign_in_denied", label: "Отказ во входе" },
  { value: "auth.sign_out", label: "Выход" },
  { value: "access.denied", label: "Доступ отклонён" },
  { value: "dictionary.registry.read", label: "Реестр словарей" },
  { value: "dictionary.metadata.read", label: "Метаданные словаря" },
  { value: "audit.journal.read", label: "Журнал" },
];

function readLocation(): LocationState {
  const query = new URLSearchParams(window.location.search);
  const view = query.get("view");
  const page = Number(query.get("page"));
  const pageSize = Number(query.get("pageSize"));
  const period = Number(query.get("period"));
  return {
    view: view === "login" || view === "detail" || view === "journal" ? view : "dictionaries",
    id: query.get("id") ?? "",
    q: query.get("q") ?? "",
    language: query.get("language") ?? "",
    kind: query.get("kind") ?? "",
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1,
    pageSize: [25, 50, 100].includes(pageSize) ? pageSize : 25,
    period: [7, 30, 90, 365].includes(period) ? period : 30,
    action: query.get("action") ?? "",
    state: query.get("state") ?? "",
    before: query.get("before") ?? "",
  };
}

function adminUrl(value: Partial<LocationState>) {
  const next = { ...readLocation(), ...value };
  const params = new URLSearchParams();
  if (next.view !== "dictionaries") params.set("view", next.view);
  if (next.id) params.set("id", next.id);
  if (next.q) params.set("q", next.q);
  if (next.language) params.set("language", next.language);
  if (next.kind) params.set("kind", next.kind);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.pageSize !== 25) params.set("pageSize", String(next.pageSize));
  if (next.view === "journal" && next.period !== 30) params.set("period", String(next.period));
  if (next.view === "journal" && next.action) params.set("action", next.action);
  if (next.state) params.set("state", next.state);
  if (next.view === "journal" && next.before) params.set("before", next.before);
  return `/admin${params.size ? `?${params.toString()}` : ""}`;
}

function CopyField({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  return <div className="grid gap-1 border-b border-slate-100 py-3 last:border-0 sm:grid-cols-[180px_1fr] sm:gap-4">
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="flex min-w-0 items-start gap-2 text-sm text-slate-900">
      <span className="min-w-0 break-words">{value || "Нет данных"}</span>
      {value && <button type="button" className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-slate-600 hover:bg-slate-100" aria-label={`Копировать: ${label}`} onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        }).catch(() => setCopied(false));
      }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Скопировано" : "Копировать"}</button>}
    </dd>
  </div>;
}

export default function AdminConsole() {
  const [location, setLocation] = useState<LocationState | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [registry, setRegistry] = useState<DictionaryRegistryPage>(blankPage);
  const [detail, setDetail] = useState<DictionaryMetadata | null>(null);
  const [events, setEvents] = useState<AdminAuditEvent[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [operatorEmail, setOperatorEmail] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [copiedEvent, setCopiedEvent] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const clearProtectedData = useCallback(() => {
    setRegistry(blankPage);
    setDetail(null);
    setEvents([]);
    setHasNext(false);
    setLoadError(false);
    setForbidden(false);
    setExpandedEvent(null);
    setLoading(true);
  }, []);

  useEffect(() => {
    const sync = () => {
      const value = readLocation();
      clearProtectedData();
      setLocation(value);
      setSearchDraft(value.q);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [clearProtectedData]);

  const navigate = useCallback((url: string, replace = false) => {
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
    const next = readLocation();
    clearProtectedData();
    setLocation(next);
    setSearchDraft(next.q);
    setMenuOpen(false);
    setFilterOpen(false);
  }, [clearProtectedData]);

  useEffect(() => {
    if (!location || location.view !== "dictionaries" || location.q === searchDraft) return;
    const timer = window.setTimeout(() => {
      const value = { ...readLocation(), q: searchDraft.trim().slice(0, 120), page: 1 };
      navigate(adminUrl(value), true);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [location, navigate, searchDraft]);

  useEffect(() => {
    if (!location || location.view === "login") {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const run = async () => {
      setLoadError(false);
      setForbidden(false);
      const sessionResponse = await fetch("/api/admin/session", { cache: "no-store" });
      if (sessionResponse.status === 401) {
        if (!cancelled) navigate(adminUrl({ view: "login", state: "expired", id: "" }));
        return;
      }
      if (sessionResponse.status === 403) {
        if (!cancelled) setForbidden(true);
        return;
      }
      if (!sessionResponse.ok) throw new Error("Admin session unavailable");
      const session = await sessionResponse.json() as { email: string; permissions: string[] };
      if (cancelled) return;
      setOperatorEmail(session.email);
      setPermissions(session.permissions);
      const needed = location.view === "journal" ? "audit.read" : "dictionaries.read";
      if (!session.permissions.includes(needed)) {
        navigate(adminUrl({ view: session.permissions.includes("dictionaries.read") ? "dictionaries" : "journal", id: "", page: 1, before: "" }), true);
        return;
      }

      if (location.view === "dictionaries") {
        const params = new URLSearchParams({ q: location.q, language: location.language, kind: location.kind, page: String(location.page), pageSize: String(location.pageSize) });
        const response = await fetch(`/api/admin/dictionaries?${params}`, { cache: "no-store" });
        if (response.status === 401) { if (!cancelled) navigate(adminUrl({ view: "login", state: "expired", id: "" })); return; }
        if (response.status === 403) { if (!cancelled) setForbidden(true); return; }
        if (!response.ok) throw new Error("Registry unavailable");
        const page = await response.json() as DictionaryRegistryPage;
        if (!cancelled) { setRegistry(page); setHasNext(page.hasNext); }
      } else if (location.view === "detail") {
        const response = await fetch(`/api/admin/dictionaries/${encodeURIComponent(location.id)}`, { cache: "no-store" });
        if (response.status === 401) { if (!cancelled) navigate(adminUrl({ view: "login", state: "expired", id: "" })); return; }
        if (response.status === 403) { if (!cancelled) setForbidden(true); return; }
        if (response.status === 404) { if (!cancelled) setDetail(null); return; }
        if (!response.ok) throw new Error("Metadata unavailable");
        const value = await response.json() as DictionaryMetadata;
        if (!cancelled) setDetail(value);
      } else {
        const params = new URLSearchParams({ page: String(location.page), pageSize: String(location.pageSize), period: String(location.period) });
        if (location.action) params.set("action", location.action);
        if (location.before) params.set("before", location.before);
        const response = await fetch(`/api/admin/audit?${params}`, { cache: "no-store" });
        if (response.status === 401) { if (!cancelled) navigate(adminUrl({ view: "login", state: "expired", id: "" })); return; }
        if (response.status === 403) { if (!cancelled) setForbidden(true); return; }
        if (!response.ok) throw new Error("Journal unavailable");
        const value = await response.json() as ApiPage<AdminAuditEvent>;
        if (!cancelled) {
          setEvents(value.items); setHasNext(value.hasNext);
          if (!location.before && value.before) window.history.replaceState({}, "", adminUrl({ before: value.before }));
        }
      }
    };
    void run()
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [location, navigate]);

  const go = (view: View) => navigate(adminUrl(view === "dictionaries"
    ? { view, id: "", state: "" }
    : { view, id: "", q: "", language: "", kind: "", page: 1, pageSize: 25, state: "", before: "" }));
  const returnToRegistry = () => navigate(adminUrl({
    view: "dictionaries",
    id: "",
    q: location?.q ?? "",
    language: location?.language ?? "",
    kind: location?.kind ?? "",
    page: location?.page ?? 1,
    pageSize: location?.pageSize ?? 25,
    state: "",
  }));

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError(false);
    try {
      const response = await fetch("/api/admin/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error("Sign in unavailable");
      const result = await response.json() as { url: string };
      window.location.assign(result.url);
    } catch {
      setLoginError(true);
      setLoginBusy(false);
    }
  };

  const signOut = async () => {
    let state = "signout-error";
    try {
      const response = await fetch("/api/admin/auth/sign-out", { method: "POST" });
      if (response.ok) state = "signed-out";
    } catch {
      // Keep the failure visible and remove protected content from the screen.
    } finally {
      navigate(adminUrl({ view: "login", state, id: "" }));
    }
  };

  if (!location) return <div className="min-h-screen animate-pulse bg-[#F8FAFF]" aria-label="Загрузка" />;
  const title = location.view === "journal" ? "Журнал" : location.view === "login" ? "Вход оператора" : location.view === "detail" ? detail?.name ?? "Метаданные словаря" : "Словари";
  const pageItems = registry.items;
  const changePage = (page: number) => navigate(adminUrl({ page }));

  if (location.view === "login") return <main className="min-h-screen bg-[#F8FAFF] px-4 py-12 text-slate-900 sm:py-20">
    <div className="mx-auto max-w-[420px] rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-50 text-primary"><ShieldAlert size={20} /></div><div><h1 className="text-xl font-semibold">2000NL Admin</h1><p className="mt-1 text-sm text-slate-500">Вход для оператора</p></div></div>
      <form className="space-y-4" onSubmit={(event) => void signIn(event)}>
        <label className="block space-y-1.5 text-sm font-medium">Электронная почта<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100" placeholder="name@example.com" /></label>
        {(loginError || location.state === "signin-error" || location.state === "expired") && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{location.state === "expired" ? "Срок действия сеанса истёк. Войдите снова." : "Не удалось выполнить вход. Проверьте доступ и попробуйте ещё раз."}</p>}
        {location.state === "signout-error" && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Не удалось подтвердить завершение сеанса. <button type="button" className="underline" onClick={() => void signOut()}>Повторить выход</button></div>}
        {location.state === "signed-out" && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Вы вышли из административной системы.</p>}
        <button disabled={loginBusy} className="min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{loginBusy ? "Переход к Google…" : "Продолжить с Google"}</button>
      </form>
      <p className="mt-4 text-xs leading-5 text-slate-500">Доступ открыт только заранее добавленным операторам. Для восстановления обратитесь к владельцу системы.</p>
    </div>
  </main>;

  return <div className="min-h-screen bg-[#F8FAFF] text-slate-900"><div className="flex min-h-screen">
    <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
      <div className="mb-8 flex items-center gap-2 px-2 text-sm font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-primary"><Database size={17} /></span>2000NL Admin</div>
      <nav className="space-y-1" aria-label="Основная навигация">{permissions.includes("dictionaries.read") && <button onClick={() => go("dictionaries")} className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm ${location.view !== "journal" ? "bg-indigo-50 font-medium text-primary" : "text-slate-600 hover:bg-slate-50"}`}><Database size={17} />Словари</button>}{permissions.includes("audit.read") && <button onClick={() => go("journal")} className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm ${location.view === "journal" ? "bg-indigo-50 font-medium text-primary" : "text-slate-600 hover:bg-slate-50"}`}><FileClock size={17} />Журнал</button>}</nav>
      <div className="mt-auto border-t border-slate-100 pt-4"><div className="mb-3 flex items-center gap-2 px-2 text-xs text-slate-600"><span className="h-2 w-2 rounded-full bg-emerald-500" />Защищённая сессия</div><div className="flex items-center justify-between gap-2 px-2 text-xs"><span className="truncate text-slate-600" title={operatorEmail}>{operatorEmail || "Оператор"}</span><button aria-label="Выйти" onClick={() => void signOut()} className="rounded p-2 text-slate-500 hover:bg-slate-100"><LogOut size={16} /></button></div></div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:justify-end lg:px-7"><button className="inline-flex h-10 items-center gap-2 rounded px-2 text-sm font-semibold lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Открыть меню"><Menu size={19} />2000NL Admin</button><div className="flex items-center gap-3 text-xs text-slate-600"><span className="hidden sm:inline">{title}</span><span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-50 font-semibold text-primary">ОП</span></div></header>
      <main className="mx-auto min-h-[calc(100vh-56px)] w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {loading ? <div className="space-y-4" role="status" aria-label="Загрузка данных"><div className="h-8 w-48 animate-pulse rounded bg-slate-200" /><div className="h-12 animate-pulse rounded-lg bg-white" /><div className="h-64 animate-pulse rounded-xl bg-white" /></div> : <>
        {loadError && <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span>Не удалось загрузить данные.</span><button className="min-h-10 rounded-lg border border-red-300 bg-white px-3" onClick={() => { const value = readLocation(); navigate(adminUrl(value), true); }}>Повторить</button></div>}
        {forbidden && <div role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">У этой учётной записи нет разрешения на этот раздел.</div>}
        {location.view === "detail" ? detail ? <>
          <button className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-slate-600 hover:bg-white" onClick={returnToRegistry}><ArrowLeft size={17} />К списку словарей</button>
          <div className="mb-7"><div className="mb-2 text-xs text-slate-500">{permissions.includes("dictionaries.read") && <button onClick={() => go("dictionaries")} className="hover:text-primary">Словари</button>}<span className="mx-2">›</span>Метаданные</div><h1 className="break-words text-2xl font-semibold tracking-tight sm:text-[28px]">{detail.name}</h1><p className="mt-2 text-sm text-slate-600">{kindLabel(detail.kind)} · Язык: {detail.languageCode.toUpperCase()}</p></div>
          <div className="max-w-4xl space-y-4 pb-8">
            <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="mb-3 text-base font-semibold">Основное</h2><dl><CopyField label="ID" value={detail.id} /><CopyField label="Стабильный ключ" value={detail.slug} /><CopyField label="Название" value={detail.name} /><CopyField label="Описание" value={detail.description} /><CopyField label="Язык" value={detail.languageCode.toUpperCase()} /><CopyField label="Тип" value={kindLabel(detail.kind)} /><CopyField label="Владелец" value={detail.ownerId} /><CopyField label="Схема" value={detail.schemaKey} /><CopyField label="Версия схемы" value={detail.schemaVersion === null ? null : String(detail.schemaVersion)} /></dl></section>
            <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="mb-3 text-base font-semibold">Источник</h2><dl><CopyField label="Провайдер" value={detail.sourceProvider} /><CopyField label="Версия источника" value={detail.sourceVersion} /><CopyField label="Загружено" value={date(detail.createdAt)} /><CopyField label="Обновлено" value={date(detail.updatedAt)} /><CopyField label="Схема: название" value={detail.schemaTitle} /><CopyField label="Схема: архивирована" value={date(detail.schemaRetiredAt)} /></dl></section>
            <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="mb-3 text-base font-semibold">Доступ и состояние</h2><dl><CopyField label="Видимость" value={detail.visibility} /><CopyField label="Публикация" value="Не настроена" /><CopyField label="Редактирование" value={detail.editable === null ? null : detail.editable ? "Разрешено" : "Запрещено"} /><CopyField label="Минимальный тариф" value={detail.minimumSubscriptionTier} /><CopyField label="Записей" value="Нет данных" /></dl></section>
          </div>
        </> : <StateBlock title="Словарь не найден" description="Проверьте реестр и попробуйте открыть словарь ещё раз." action="Вернуться к списку" onAction={returnToRegistry} />
        : location.view === "journal" ? <>
          <div className="mb-7"><h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Журнал</h1><p className="mt-2 text-sm text-slate-600">События доступа операторов и контекст запросов.</p></div>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="space-y-1 text-xs font-medium text-slate-600">Действие<select value={location.action} onChange={(event) => navigate(adminUrl({ action: event.target.value, page: 1, before: "" }))} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm sm:w-56">{actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="space-y-1 text-xs font-medium text-slate-600">Период<select value={location.period} onChange={(event) => navigate(adminUrl({ period: Number(event.target.value), page: 1, before: "" }))} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm sm:w-36"><option value={7}>7 дней</option><option value={30}>30 дней</option><option value={90}>90 дней</option><option value={365}>Год</option></select></label></div>
          {events.length === 0 ? <StateBlock title="Событий пока нет" description="Для выбранных фильтров нет записей журнала." action="Сбросить фильтры" onAction={() => navigate(adminUrl({ action: "", period: 30, page: 1, before: "" }))} /> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Время", "Действие", "Цель", "Оператор", "Результат"].map((value) => <th key={value} className="px-4 py-3 font-medium">{value}</th>)}</tr></thead><tbody>{events.map((event) => <tr key={event.id} className="border-t border-slate-100"><td className="whitespace-nowrap px-4 py-3">{date(event.occurredAt)}</td><td className="px-4 py-3 font-mono text-xs">{event.action}</td><td className="max-w-64 break-words px-4 py-3">{targetLabel(event)}</td><td className="max-w-56 break-all px-4 py-3 font-mono text-xs">{event.operatorId ?? "Нет данных"}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs ${event.outcome === "success" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{event.outcome === "success" ? "Успешно" : event.outcome === "denied" ? "Отказано" : "Ошибка"}</span></td><td className="px-4 py-3"><button className="min-h-9 text-xs font-medium text-primary hover:underline" onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)} aria-expanded={expandedEvent === event.id}>{expandedEvent === event.id ? "Скрыть" : "Подробнее"}</button></td></tr>)}</tbody></table></div>
            {events.map((event) => expandedEvent === event.id && <div key={`details-${event.id}`} className="grid gap-3 border-t border-slate-100 bg-slate-50 p-4 text-xs sm:grid-cols-2"><div><span className="text-slate-500">Correlation ID</span><div className="mt-1 flex items-center gap-2 break-all font-mono">{event.correlationId}<button aria-label="Копировать Correlation ID" className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded px-2 text-slate-600 hover:bg-white" onClick={() => { void navigator.clipboard.writeText(event.correlationId).then(() => { setCopiedEvent(event.id); window.setTimeout(() => setCopiedEvent(null), 1200); }).catch(() => setCopiedEvent(null)); }}>{copiedEvent === event.id ? <Check size={14} /> : <Copy size={14} />}{copiedEvent === event.id ? "Скопировано" : "Копировать"}</button></div></div><div><span className="text-slate-500">IP</span><p className="mt-1 break-all">{event.clientContext?.ipAddress ?? "Нет данных"}</p></div><div className="sm:col-span-2"><span className="text-slate-500">User-Agent</span><p className="mt-1 break-all">{event.clientContext?.userAgent ?? "Нет данных"}</p></div></div>)}
            <Pagination page={location.page} pageSize={location.pageSize} hasNext={hasNext} onPage={changePage} onPageSize={(value) => navigate(adminUrl({ pageSize: value, page: 1 }))} /></div>}
        </> : <>
          <div className="mb-7"><h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Словари</h1><p className="mt-2 text-sm text-slate-600">Источники и их текущее состояние.</p></div>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="relative min-w-0 flex-1 space-y-1 text-xs font-medium text-slate-600">Поиск по названию или ключу<span className="relative block"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-indigo-100" placeholder="Название или ключ" /></span></label><button onClick={() => setFilterOpen(!filterOpen)} aria-expanded={filterOpen} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm hover:bg-slate-50 sm:hidden"><Filter size={16} />Фильтры</button><div className={`${filterOpen ? "grid" : "hidden"} grid-cols-2 gap-3 sm:grid sm:w-[390px]`}><label className="space-y-1 text-xs font-medium text-slate-600">Язык<select value={location.language} onChange={(event) => navigate(adminUrl({ language: event.target.value, page: 1 }))} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Все</option>{["nl", "en", "de", "fr", "es", "it"].map((code) => <option key={code} value={code}>{code.toUpperCase()}</option>)}</select></label><label className="space-y-1 text-xs font-medium text-slate-600">Тип источника<select value={location.kind} onChange={(event) => navigate(adminUrl({ kind: event.target.value, page: 1 }))} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Все</option><option value="curated">Кураторский</option><option value="user">Пользовательский</option></select></label></div>{(location.language || location.kind || location.q) && <button className="min-h-10 rounded-lg px-3 text-sm font-medium text-primary hover:bg-indigo-50" onClick={() => { setSearchDraft(""); navigate(adminUrl({ q: "", language: "", kind: "", page: 1 })); }}>Сбросить</button>}</div>
          {pageItems.length === 0 ? <StateBlock title={location.q || location.language || location.kind ? "Ничего не найдено" : "Словарей пока нет"} description={location.q || location.language || location.kind ? "Измените запрос или сбросьте фильтры." : "Когда данные появятся, они будут показаны здесь."} action="Сбросить фильтры" onAction={() => { setSearchDraft(""); navigate(adminUrl({ q: "", language: "", kind: "", page: 1 })); }} /> : <>
            <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block"><div className="overflow-x-auto"><table className="w-full min-w-[800px] border-collapse text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Словарь", "Язык", "Тип", "Владелец", "Видимость", "Записей", "Обновлено"].map((value) => <th key={value} className="px-4 py-3 font-medium">{value}</th>)}</tr></thead><tbody>{pageItems.map((item) => <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50"><td className="max-w-[360px] px-4 py-3"><a href={adminUrl({ ...location, view: "detail", id: item.id })} onClick={(event) => { event.preventDefault(); navigate(adminUrl({ ...location, view: "detail", id: item.id })); }} className="block min-h-10 rounded text-sm font-medium text-primary hover:underline"><span className="line-clamp-2">{item.name}</span><span className="mt-1 block font-mono text-[11px] font-normal text-slate-500">{item.slug}</span></a></td><td className="px-4 py-3">{item.languageCode.toUpperCase() || "Нет данных"}</td><td className="px-4 py-3">{kindLabel(item.kind)}</td><td className="px-4 py-3">{item.ownerId ?? "Нет данных"}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{item.visibility ?? "Нет данных"}</span></td><td className="px-4 py-3">Нет данных</td><td className="whitespace-nowrap px-4 py-3">{date(item.updatedAt)}</td></tr>)}</tbody></table></div><Pagination page={location.page} pageSize={location.pageSize} hasNext={registry.hasNext} onPage={changePage} onPageSize={(value) => navigate(adminUrl({ pageSize: value, page: 1 }))} /></div>
            <div className="mt-3 space-y-3 sm:hidden">{pageItems.map((item) => <a key={item.id} href={adminUrl({ ...location, view: "detail", id: item.id })} onClick={(event) => { event.preventDefault(); navigate(adminUrl({ ...location, view: "detail", id: item.id })); }} className="block w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200"><div className="flex items-start justify-between gap-2"><span className="break-words text-sm font-medium text-primary">{item.name}</span><ChevronRight size={17} className="shrink-0 text-slate-500" /></div><p className="mt-1 break-all font-mono text-[11px] text-slate-500">{item.slug}</p><p className="mt-3 text-xs text-slate-600">{item.languageCode.toUpperCase()} · {kindLabel(item.kind)}</p><span className="mt-2 inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{item.visibility ?? "Нет данных"}</span></a>)}<Pagination page={location.page} pageSize={location.pageSize} hasNext={registry.hasNext} onPage={changePage} onPageSize={(value) => navigate(adminUrl({ pageSize: value, page: 1 }))} /></div>
          </>}
        </>}
        </>}
      </main>
    </div>
  </div>
    {menuOpen && <div className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" onClick={() => setMenuOpen(false)}><aside onClick={(event) => event.stopPropagation()} className="flex h-full w-[min(300px,85vw)] flex-col bg-white p-4 shadow-xl"><div className="mb-8 flex items-center justify-between"><span className="font-semibold">2000NL Admin</span><button onClick={() => setMenuOpen(false)} aria-label="Закрыть меню" className="grid h-10 w-10 place-items-center rounded-lg"><X size={19} /></button></div>{permissions.includes("dictionaries.read") && <button onClick={() => go("dictionaries")} className="flex min-h-11 items-center gap-3 rounded-lg bg-indigo-50 px-3 text-left text-sm font-medium text-primary"><Database size={17} />Словари</button>}{permissions.includes("audit.read") && <button onClick={() => go("journal")} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm text-slate-600"><FileClock size={17} />Журнал</button>}<div className="mt-auto border-t border-slate-100 pt-4"><p className="mb-3 break-all text-xs text-slate-500">{operatorEmail}</p><button onClick={() => void signOut()} className="flex min-h-11 items-center gap-3 text-sm text-slate-600"><LogOut size={17} />Выйти</button></div></aside></div>}
  </div>;
}

function Pagination({ page, pageSize, hasNext, onPage, onPageSize }: { page: number; pageSize: number; hasNext: boolean; onPage: (page: number) => void; onPageSize: (value: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600"><span>Страница {page}</span><div className="flex items-center gap-2"><label className="flex items-center gap-2">Строк<select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} className="h-9 rounded-md border border-slate-300 bg-white px-2"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><button aria-label="Предыдущая страница" disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 disabled:opacity-40"><ChevronLeft size={16} /></button><button aria-label="Следующая страница" disabled={!hasNext} onClick={() => onPage(page + 1)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 disabled:opacity-40"><ChevronRight size={16} /></button></div></div>;
}

function StateBlock({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center"><Activity size={24} className="mx-auto mb-3 text-slate-400" /><h2 className="text-base font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{description}</p><button onClick={onAction} className="mt-5 min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-indigo-700">{action}</button></div>;
}
