"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
import type {
  DictionaryMetadata,
  DictionaryRegistryRow,
} from "@/lib/admin/dictionaryContract";

type View = "login" | "dictionaries" | "detail" | "journal";

type DictionaryFixture = DictionaryMetadata;

const dictionaries: DictionaryFixture[] = [
  {
    id: "95b81d3e-7000-4b18-9900-000000000001",
    slug: "nl-vandale-core-2000",
    name: "Frequency Dictionary NL — Core 2000",
    languageCode: "nl",
    kind: "curated",
    visibility: "system",
    ownerId: null,
    sourceProvider: "vandale",
    sourceVersion: "2026.04",
    schemaKey: "nl-vandale-v1",
    schemaVersion: 1,
    updatedAt: "2026-09-12T14:20:00.000Z",
    entryCount: null,
    description: "Core vocabulary source for Dutch learners.",
    editable: false,
    minimumSubscriptionTier: "free",
    createdAt: "2024-02-05T11:12:00.000Z",
    schemaTitle: "Dutch dictionary entry schema",
    schemaRetiredAt: null,
  },
  {
    id: "95b81d3e-7000-4b18-9900-000000000002",
    slug: "nl-colloquialisms-slang",
    name: "NL Colloquialisms & Slang Extended Community Pack",
    languageCode: "nl",
    kind: "curated",
    visibility: "shared",
    ownerId: null,
    sourceProvider: null,
    sourceVersion: null,
    schemaKey: null,
    schemaVersion: null,
    updatedAt: null,
    entryCount: null,
    description: null,
    editable: null,
    minimumSubscriptionTier: null,
    createdAt: null,
    schemaTitle: null,
    schemaRetiredAt: null,
  },
  {
    id: "95b81d3e-7000-4b18-9900-000000000003",
    slug: "en-base-100",
    name: "EN Base 100",
    languageCode: "en",
    kind: "curated",
    visibility: "public",
    ownerId: null,
    sourceProvider: "manual-import",
    sourceVersion: null,
    schemaKey: "en-core-v1",
    schemaVersion: 2,
    updatedAt: "2026-08-01T09:15:00.000Z",
    entryCount: null,
    description: "A compact English reference dictionary.",
    editable: false,
    minimumSubscriptionTier: "free",
    createdAt: null,
    schemaTitle: null,
    schemaRetiredAt: null,
  },
  {
    id: "95b81d3e-7000-4b18-9900-000000000004",
    slug: "de-grundwortschatz",
    name: "DE Grundwortschatz",
    languageCode: "de",
    kind: "curated",
    visibility: "system",
    ownerId: null,
    sourceProvider: null,
    sourceVersion: null,
    schemaKey: null,
    schemaVersion: null,
    updatedAt: null,
    entryCount: null,
    description: null,
    editable: null,
    minimumSubscriptionTier: null,
    createdAt: null,
    schemaTitle: null,
    schemaRetiredAt: null,
  },
  {
    id: "95b81d3e-7000-4b18-9900-000000000005",
    slug: "fr-frequency-core",
    name: "FR Frequency Core",
    languageCode: "fr",
    kind: "curated",
    visibility: "private",
    ownerId: null,
    sourceProvider: null,
    sourceVersion: null,
    schemaKey: null,
    schemaVersion: null,
    updatedAt: null,
    entryCount: null,
    description: null,
    editable: null,
    minimumSubscriptionTier: null,
    createdAt: null,
    schemaTitle: null,
    schemaRetiredAt: null,
  },
  {
    id: "95b81d3e-7000-4b18-9900-000000000006",
    slug: "es-cognados-basicos",
    name: "ES Cognados Básicos",
    languageCode: "es",
    kind: "curated",
    visibility: "system",
    ownerId: null,
    sourceProvider: null,
    sourceVersion: null,
    schemaKey: null,
    schemaVersion: null,
    updatedAt: null,
    entryCount: null,
    description: null,
    editable: null,
    minimumSubscriptionTier: null,
    createdAt: null,
    schemaTitle: null,
    schemaRetiredAt: null,
  },
];

const journal = [
  { id: "evt-01", at: "2026-09-24T08:41:06.000Z", action: "dictionary.metadata.view", target: "nl-vandale-core-2000", outcome: "Разрешено", actor: "operator-01", correlation: "c55e940d-…", context: null },
  { id: "evt-02", at: "2026-09-24T08:33:50.000Z", action: "auth.sign_in", target: "operator-01", outcome: "Успешно", actor: "operator-01", correlation: "9d740612-…", context: null },
  { id: "evt-03", at: "2026-09-24T08:31:12.000Z", action: "auth.sign_in", target: "operator-01", outcome: "Отказано", actor: "—", correlation: "7bef441d-…", context: null },
  { id: "evt-04", at: "2026-09-23T18:08:42.000Z", action: "admin.access.denied", target: "/api/admin/audit", outcome: "Отказано", actor: "operator-02", correlation: "0ac3132b-…", context: null },
];

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Нет данных";

const kindLabel = (kind: DictionaryRegistryRow["kind"]) =>
  kind === "curated" ? "Кураторский" : kind === "user" ? "Пользовательский" : "Нет данных";

const visibilityLabel = (visibility: DictionaryRegistryRow["visibility"]) =>
  visibility ?? "Нет данных";

function readLocation() {
  const query = new URLSearchParams(window.location.search);
  return {
    view: (query.get("view") as View | null) ?? "dictionaries",
    id: query.get("id"),
    q: query.get("q") ?? "",
    language: query.get("language") ?? "",
    kind: query.get("kind") ?? "",
    state: query.get("state") ?? "",
    page: Math.max(1, Number(query.get("page")) || 1),
    pageSize: [25, 50, 100].includes(Number(query.get("pageSize"))) ? Number(query.get("pageSize")) : 25,
  };
}

function buildUrl(next: Partial<ReturnType<typeof readLocation>>) {
  const current = readLocation();
  const value = { ...current, ...next };
  const params = new URLSearchParams();
  if (value.view !== "dictionaries") params.set("view", value.view);
  if (value.id) params.set("id", value.id);
  if (value.q) params.set("q", value.q);
  if (value.language) params.set("language", value.language);
  if (value.kind) params.set("kind", value.kind);
  if (value.state) params.set("state", value.state);
  if (value.page > 1) params.set("page", String(value.page));
  if (value.pageSize !== 25) params.set("pageSize", String(value.pageSize));
  const query = params.toString();
  return `/admin/preview${query ? `?${query}` : ""}`;
}

function dictionaryHref(dictionary: DictionaryMetadata) {
  const params = new URLSearchParams(window.location.search);
  params.set("view", "detail");
  params.set("id", dictionary.id);
  return `/admin/preview?${params.toString()}`;
}

function TextField({ label, value, copyable = false }: { label: string; value: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1 border-b border-slate-100 py-3 last:border-0 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="flex min-w-0 items-start gap-2 text-sm text-slate-900">
        <span className={copyable ? "break-all font-mono text-xs" : "min-w-0 break-words"}>{value || "Нет данных"}</span>
        {copyable && value && (
          <button
            type="button"
            className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label={`Копировать: ${label}`}
            onClick={() => {
              void navigator.clipboard.writeText(value).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              });
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Скопировано" : "Копировать"}
          </button>
        )}
      </dd>
    </div>
  );
}

export default function AdminConsolePreview() {
  const [location, setLocation] = useState<ReturnType<typeof readLocation> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>("evt-01");
  const [searchDraft, setSearchDraft] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [journalAction, setJournalAction] = useState("");
  const [journalPeriod, setJournalPeriod] = useState("7");
  const [copiedEvent, setCopiedEvent] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const next = readLocation();
      setLocation(next);
      setSearchDraft(next.q);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const navigate = (url: string) => {
    window.history.pushState({}, "", url);
    const next = readLocation();
    setLocation(next);
    setSearchDraft(next.q);
    setMenuOpen(false);
    setFilterOpen(false);
  };

  const activeView = location?.view;
  useEffect(() => {
    if (activeView !== "dictionaries") return;
    const timer = window.setTimeout(() => {
      const next = { ...readLocation(), q: searchDraft, page: 1 };
      window.history.replaceState({}, "", buildUrl(next));
      setLocation(next);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activeView, searchDraft]);

  const filtered = useMemo(() => {
    if (!location) return [];
    const needle = location.q.toLocaleLowerCase();
    return dictionaries.filter((item) =>
      (!location.language || item.languageCode === location.language) &&
      (!location.kind || item.kind === location.kind) &&
      (!needle || `${item.name} ${item.slug}`.toLocaleLowerCase().includes(needle)),
    ).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }, [location]);

  if (!location) return <div className="min-h-screen animate-pulse bg-[#F8FAFF]" aria-label="Загрузка" />;
  const current = dictionaries.find((item) => item.id === location.id) ?? null;
  const pageSize = location.pageSize;
  const start = (location.page - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  const hasNext = start + pageSize < filtered.length;
  const filteredJournal = journal.filter((event) => {
    const actionMatches = !journalAction || event.action.startsWith(journalAction);
    const periodMatches = journalPeriod === "all" || Date.now() - Date.parse(event.at) <= Number(journalPeriod) * 24 * 60 * 60 * 1000;
    return actionMatches && periodMatches;
  });
  const journalPageItems = filteredJournal.slice(start, start + pageSize);
  const journalHasNext = start + pageSize < filteredJournal.length;
  const title = location.view === "journal" ? "Журнал" : location.view === "login" ? "Вход оператора" : current ? current.name : "Словари";

  const linkTo = (view: View) =>
    navigate(view === "dictionaries"
      ? buildUrl({ view, id: null })
      : buildUrl({ view, id: null, q: "", language: "", kind: "", page: 1, pageSize: 25 }));

  return (
    <div className="min-h-screen bg-[#F8FAFF] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
          <div className="mb-8 flex items-center gap-2 px-2 text-sm font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-primary"><Database size={17} /></span>2000NL Admin</div>
          <nav className="space-y-1" aria-label="Основная навигация">
            <button onClick={() => linkTo("dictionaries")} className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm ${location.view !== "journal" ? "bg-indigo-50 font-medium text-primary" : "text-slate-600 hover:bg-slate-50"}`}><Database size={17} />Словари</button>
            <button onClick={() => linkTo("journal")} className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm ${location.view === "journal" ? "bg-indigo-50 font-medium text-primary" : "text-slate-600 hover:bg-slate-50"}`}><FileClock size={17} />Журнал</button>
          </nav>
          <div className="mt-auto border-t border-slate-100 pt-4">
            <div className="mb-3 flex items-center gap-2 px-2 text-xs text-slate-600"><span className="h-2 w-2 rounded-full bg-amber-500" />Local</div>
            <div className="flex items-center justify-between gap-2 px-2 text-xs"><span className="truncate text-slate-600">Оператор</span><button aria-label="Выйти" onClick={() => linkTo("login")} className="rounded p-2 text-slate-500 hover:bg-slate-100"><LogOut size={16} /></button></div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:justify-end lg:px-7">
            <button className="inline-flex h-10 items-center gap-2 rounded px-2 text-sm font-semibold lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Открыть меню"><Menu size={19} />2000NL Admin</button>
            <div className="flex items-center gap-3 text-xs text-slate-600"><span className="hidden sm:inline">{title}</span><span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-50 font-semibold text-primary">ОП</span></div>
          </header>

          <main className="mx-auto min-h-[calc(100vh-56px)] w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {location.view === "login" ? (
              <div className="mx-auto mt-12 max-w-[400px] rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:mt-20 sm:p-8">
                <div className="mb-6 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-50 text-primary"><ShieldAlert size={20} /></div><div><h1 className="text-xl font-semibold">2000NL Admin</h1><p className="mt-1 text-sm text-slate-500">Вход для оператора</p></div></div>
                <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setLoginError(true); }}>
                  <label className="block space-y-1.5 text-sm font-medium">Электронная почта<input required type="email" autoComplete="username" className="h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100" placeholder="name@example.com" /></label>
                  <label className="block space-y-1.5 text-sm font-medium">Пароль<input required type="password" autoComplete="current-password" className="h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100" placeholder="Пароль" /></label>
                  {(loginError || location.state === "expired") && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{location.state === "expired" ? "Срок действия сеанса истёк. Войдите снова." : "Не удалось выполнить вход. Проверьте данные и попробуйте ещё раз."}</p>}
                  <button className="min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">Войти</button>
                </form>
                <p className="mt-4 text-xs leading-5 text-slate-500">Если учётная запись оператора не активна, обратитесь к владельцу системы.</p>
              </div>
            ) : location.view === "detail" ? (
              current ? <>
                <button className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-slate-600 hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary" onClick={() => linkTo("dictionaries")}><ArrowLeft size={17} />К списку словарей</button>
                <div className="mb-7"><div className="mb-2 text-xs text-slate-500"><button onClick={() => linkTo("dictionaries")} className="hover:text-primary">Словари</button><span className="mx-2">›</span>Метаданные</div><h1 className="break-words text-2xl font-semibold tracking-tight sm:text-[28px]">{current.name}</h1><p className="mt-2 text-sm text-slate-600">{kindLabel(current.kind)} · Язык: {current.languageCode.toUpperCase()}</p></div>
                <div className="max-w-4xl space-y-4 pb-8">
                  <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="mb-3 text-base font-semibold">Основное</h2><dl><TextField label="ID" value={current.id} copyable /><TextField label="Стабильный ключ" value={current.slug} copyable /><TextField label="Название" value={current.name} /><TextField label="Описание" value={current.description ?? "Нет данных"} /><TextField label="Язык" value={current.languageCode.toUpperCase()} /><TextField label="Тип" value={kindLabel(current.kind)} /><TextField label="Владелец" value={current.ownerId ?? "Нет данных"} /><TextField label="Схема" value={current.schemaKey ?? "Нет данных"} /><TextField label="Версия схемы" value={current.schemaVersion === null ? "Нет данных" : String(current.schemaVersion)} /></dl></section>
                  <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="mb-3 text-base font-semibold">Доступ</h2><dl><TextField label="Текущая видимость" value={visibilityLabel(current.visibility)} /><TextField label="Минимальный тариф" value={current.minimumSubscriptionTier ?? "Нет данных"} /><TextField label="Редактируемый" value={current.editable === null ? "Нет данных" : current.editable ? "Да" : "Нет"} /></dl></section>
                  <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="mb-3 text-base font-semibold">Обновление и объём</h2><dl><TextField label="Источник" value={current.sourceProvider ?? "Нет данных"} /><TextField label="Версия источника" value={current.sourceVersion ?? "Нет данных"} /><TextField label="Создано" value={formatDate(current.createdAt)} /><TextField label="Обновлено" value={formatDate(current.updatedAt)} /><TextField label="Записей" value="Нет данных" /></dl></section>
                </div>
              </> : <StateBlock title="Словарь не найден" description="Объект мог быть удалён или идентификатор неверен." onAction={() => linkTo("dictionaries")} action="Вернуться к списку" />
            ) : location.view === "journal" ? (
              <>
                <div className="mb-7"><h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Журнал</h1><p className="mt-2 text-sm text-slate-600">Записи о действиях административных операторов.</p></div>
                <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="space-y-1 text-xs font-medium text-slate-600">Период<select value={journalPeriod} onChange={(event) => { setJournalPeriod(event.target.value); navigate(buildUrl({ page: 1 })); }} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"><option value="7">Последние 7 дней</option><option value="30">Последние 30 дней</option><option value="all">Всё время</option></select></label>
                  <label className="space-y-1 text-xs font-medium text-slate-600">Действие<select value={journalAction} onChange={(event) => { setJournalAction(event.target.value); navigate(buildUrl({ page: 1 })); }} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"><option value="">Все события</option><option value="auth.sign_">Вход / выход</option><option value="dictionary.metadata">Просмотр метаданных</option><option value="admin.access">Отказ в доступе</option></select></label>
                  <button className="mt-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm hover:bg-slate-50"><Filter size={16} />Фильтр</button>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Время", "Оператор", "Действие", "Объект", "Результат"].map((cell) => <th key={cell} className="px-4 py-3 font-medium">{cell}</th>)}</tr></thead><tbody>{journalPageItems.map((event) => <Fragment key={event.id}><tr className="border-t border-slate-100"><td className="whitespace-nowrap px-4 py-3">{formatDate(event.at)}</td><td className="px-4 py-3">{event.actor}</td><td className="px-4 py-3 font-mono text-xs">{event.action}</td><td className="px-4 py-3">{event.target}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs ${event.outcome === "Отказано" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{event.outcome}</span></td></tr><tr className="border-t border-slate-50"><td colSpan={5} className="px-4 pb-2"><button className="min-h-9 text-xs font-medium text-primary hover:underline" onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)} aria-expanded={expandedEvent === event.id}>{expandedEvent === event.id ? "Скрыть технические сведения" : "Технические сведения"} {event.id}</button>{expandedEvent === event.id && <dl className="grid gap-x-8 gap-y-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2"><div><dt className="text-slate-500">Correlation ID</dt><dd className="mt-1 flex items-center gap-2 font-mono">{event.correlation}<button aria-label="Копировать Correlation ID" className="inline-flex min-h-8 items-center gap-1 rounded px-2 text-slate-600 hover:bg-white" onClick={() => { void navigator.clipboard.writeText(event.correlation).then(() => { setCopiedEvent(event.id); window.setTimeout(() => setCopiedEvent(null), 1200); }); }}>{copiedEvent === event.id ? <Check size={14} /> : <Copy size={14} />}{copiedEvent === event.id ? "Скопировано" : "Копировать"}</button></dd></div><div><dt className="text-slate-500">IP</dt><dd className="mt-1">{event.context ?? "Нет данных"}</dd></div><div><dt className="text-slate-500">Browser / OS</dt><dd className="mt-1">Нет данных</dd></div><div><dt className="text-slate-500">User-Agent</dt><dd className="mt-1 break-all">Нет данных</dd></div></dl>}</td></tr></Fragment>)}</tbody></table></div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600"><span>Показано {journalPageItems.length} записей</span><div className="flex items-center gap-2"><label className="flex items-center gap-2">Строк на странице<select value={pageSize} onChange={(event) => navigate(buildUrl({ pageSize: Number(event.target.value) as 25 | 50 | 100, page: 1 }))} className="h-9 rounded-md border border-slate-300 bg-white px-2"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><button aria-label="Предыдущая страница" className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 disabled:opacity-40" disabled={location.page <= 1} onClick={() => navigate(buildUrl({ page: location.page - 1 }))}><ChevronLeft size={16} /></button><button aria-label="Следующая страница" className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 disabled:opacity-40" disabled={!journalHasNext} onClick={() => navigate(buildUrl({ page: location.page + 1 }))}><ChevronRight size={16} /></button></div></div>
                </div>
              </>
            ) : (
              <>
                <div className="mb-7"><h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Словари</h1><p className="mt-2 text-sm text-slate-600">Источники и их текущее состояние.</p></div>
                {location.state === "error" && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span>Не удалось загрузить реестр словарей.</span><button onClick={() => navigate(buildUrl({ state: "" }))} className="min-h-10 rounded-lg border border-red-300 bg-white px-3 font-medium hover:bg-red-100">Повторить</button></div>}
                {location.state === "forbidden" && <div role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">У этой учётной записи нет доступа к административному реестру.</div>}
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="relative min-w-0 flex-1 space-y-1 text-xs font-medium text-slate-600">Поиск по названию или ключу<span className="relative block"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-indigo-100" placeholder="Название или ключ" /></span></label>
                  <button onClick={() => setFilterOpen(!filterOpen)} aria-expanded={filterOpen} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm hover:bg-slate-50 sm:hidden"><Filter size={16} />Фильтры</button>
                  <div className={`${filterOpen ? "grid" : "hidden"} grid-cols-2 gap-3 sm:grid sm:w-[390px]`}>
                    <label className="space-y-1 text-xs font-medium text-slate-600">Язык<select value={location.language} onChange={(event) => navigate(buildUrl({ language: event.target.value, page: 1 }))} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"><option value="">Все</option>{["nl", "en", "de", "fr", "es", "it"].map((code) => <option key={code} value={code}>{code.toUpperCase()}</option>)}</select></label>
                    <label className="space-y-1 text-xs font-medium text-slate-600">Тип источника<select value={location.kind} onChange={(event) => navigate(buildUrl({ kind: event.target.value, page: 1 }))} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"><option value="">Все</option><option value="curated">Кураторский</option><option value="user">Пользовательский</option></select></label>
                  </div>
                  {(location.language || location.kind || location.q) && <button className="min-h-10 rounded-lg px-3 text-sm font-medium text-primary hover:bg-indigo-50" onClick={() => { setSearchDraft(""); navigate(buildUrl({ q: "", language: "", kind: "", page: 1 })); }}>Сбросить</button>}
                </div>
                {pageItems.length === 0 ? <StateBlock title={location.q || location.language || location.kind ? "Ничего не найдено" : "Словарей пока нет"} description={location.q || location.language || location.kind ? "Измените поисковый запрос или сбросьте фильтры." : "Когда данные появятся, они будут показаны здесь."} onAction={() => { setSearchDraft(""); navigate(buildUrl({ q: "", language: "", kind: "", page: 1 })); }} action="Сбросить фильтры" /> : <>
                  <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block"><div className="overflow-x-auto"><table className="w-full min-w-[800px] border-collapse text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Словарь", "Язык", "Тип", "Владелец", "Видимость", "Записей", "Обновлено"].map((cell) => <th key={cell} className="px-4 py-3 font-medium">{cell}</th>)}</tr></thead><tbody>{pageItems.map((item) => <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50"><td className="max-w-[360px] px-4 py-3"><a href={dictionaryHref(item)} onClick={(event) => { event.preventDefault(); navigate(dictionaryHref(item)); }} className="block min-h-10 rounded text-left text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary"><span className="line-clamp-2">{item.name}</span><span className="mt-1 block font-mono text-[11px] font-normal text-slate-500">{item.slug}</span></a></td><td className="px-4 py-3">{item.languageCode.toUpperCase()}</td><td className="px-4 py-3">{kindLabel(item.kind)}</td><td className="px-4 py-3">{item.ownerId ?? "Нет данных"}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{visibilityLabel(item.visibility)}</span></td><td className="px-4 py-3">Нет данных</td><td className="whitespace-nowrap px-4 py-3">{formatDate(item.updatedAt)}</td></tr>)}</tbody></table></div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600"><span>Показано {pageItems.length} на странице</span><div className="flex items-center gap-2"><label className="flex items-center gap-2">Строк на странице<select value={pageSize} onChange={(event) => navigate(buildUrl({ pageSize: Number(event.target.value), page: 1 }))} className="h-9 rounded-md border border-slate-300 bg-white px-2"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><button aria-label="Предыдущая страница" disabled={location.page <= 1} onClick={() => navigate(buildUrl({ page: location.page - 1 }))} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 disabled:opacity-40"><ChevronLeft size={16} /></button><button aria-label="Следующая страница" disabled={!hasNext} onClick={() => navigate(buildUrl({ page: location.page + 1 }))} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 disabled:opacity-40"><ChevronRight size={16} /></button></div></div>
                  </div>
                  <div className="mt-3 space-y-3 sm:hidden">{pageItems.map((item) => <a key={`mobile-${item.id}`} href={dictionaryHref(item)} onClick={(event) => { event.preventDefault(); navigate(dictionaryHref(item)); }} className="block w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-indigo-200 focus:outline-none focus:ring-2 focus:ring-primary"><div className="flex items-start justify-between gap-2"><span className="break-words text-sm font-medium text-primary">{item.name}</span><ChevronRight size={17} className="shrink-0 text-slate-500" /></div><p className="mt-1 break-all font-mono text-[11px] text-slate-500">{item.slug}</p><p className="mt-3 text-xs text-slate-600">{item.languageCode.toUpperCase()} · {kindLabel(item.kind)}</p><span className="mt-2 inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{visibilityLabel(item.visibility)}</span></a>)}</div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 sm:hidden"><span>Показано {pageItems.length} записей</span><div className="flex items-center gap-2"><label className="flex items-center gap-2">Строк<select value={pageSize} onChange={(event) => navigate(buildUrl({ pageSize: Number(event.target.value), page: 1 }))} className="h-9 rounded-md border border-slate-300 bg-white px-2"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><button aria-label="Предыдущая страница" disabled={location.page <= 1} onClick={() => navigate(buildUrl({ page: location.page - 1 }))} className="grid h-10 w-10 place-items-center rounded-md border border-slate-300 disabled:opacity-40"><ChevronLeft size={16} /></button><button aria-label="Следующая страница" disabled={!hasNext} onClick={() => navigate(buildUrl({ page: location.page + 1 }))} className="grid h-10 w-10 place-items-center rounded-md border border-slate-300 disabled:opacity-40"><ChevronRight size={16} /></button></div></div>
                </>}
              </>
            )}
          </main>
        </div>
      </div>

      {menuOpen && <div className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" onClick={() => setMenuOpen(false)}><aside onClick={(event) => event.stopPropagation()} className="flex h-full w-[min(300px,85vw)] flex-col bg-white p-4 shadow-xl"><div className="mb-8 flex items-center justify-between"><span className="font-semibold">2000NL Admin</span><button onClick={() => setMenuOpen(false)} aria-label="Закрыть меню" className="grid h-10 w-10 place-items-center rounded-lg"><X size={19} /></button></div><button onClick={() => linkTo("dictionaries")} className="flex min-h-11 items-center gap-3 rounded-lg bg-indigo-50 px-3 text-left text-sm font-medium text-primary"><Database size={17} />Словари</button><button onClick={() => linkTo("journal")} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm text-slate-600"><FileClock size={17} />Журнал</button><div className="mt-auto border-t border-slate-100 pt-4"><p className="mb-3 text-xs text-slate-500">Local</p><button onClick={() => linkTo("login")} className="flex min-h-11 items-center gap-3 text-sm text-slate-600"><LogOut size={17} />Выйти</button></div></aside></div>}
    </div>
  );
}

function StateBlock({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center"><Activity size={24} className="mx-auto mb-3 text-slate-400" /><h2 className="text-base font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{description}</p><button onClick={onAction} className="mt-5 min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-indigo-700">{action}</button></div>;
}
