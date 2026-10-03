"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Database, FileClock, LogOut, Menu, Search, Users, X } from "lucide-react";
import type { AdminUserRegistryPage, AdminUserRegistryRow } from "@/lib/admin/userContract";

type OperatorSession = { email: string; permissions: string[] };
type ViewState = "loading" | "ready" | "unauthorized" | "forbidden" | "unavailable" | "not-found";

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Нет данных";
const shortId = (value: string) => `${value.slice(0, 8)}…${value.slice(-4)}`;

export function AdminUsersConsole({ userId }: { userId?: string }) {
  const [operator, setOperator] = useState<OperatorSession | null>(null);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [registry, setRegistry] = useState<AdminUserRegistryPage | null>(null);
  const [profile, setProfile] = useState<AdminUserRegistryRow | null>(null);
  const [draftQuery, setDraftQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [menuOpen, setMenuOpen] = useState(false);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setViewState("loading");
    setRegistry(null);
    setProfile(null);
    try {
      const sessionResponse = await fetch("/api/admin/session", { cache: "no-store", signal });
      if (sessionResponse.status === 401 || sessionResponse.status === 403) {
        setViewState("unauthorized");
        return;
      }
      if (!sessionResponse.ok) throw new Error("session unavailable");
      const session = await sessionResponse.json() as OperatorSession;
      setOperator(session);
      if (!session.permissions.includes("users.read")) {
        setViewState("forbidden");
        return;
      }

      const endpoint = userId
        ? `/api/admin/users/${encodeURIComponent(userId)}`
        : `/api/admin/users?q=${encodeURIComponent(appliedQuery)}&page=${page}&pageSize=${pageSize}`;
      const response = await fetch(endpoint, { cache: "no-store", signal });
      if (response.status === 401) {
        setViewState("unauthorized");
        return;
      }
      if (response.status === 403) {
        setViewState("forbidden");
        return;
      }
      if (response.status === 404) {
        setViewState("not-found");
        return;
      }
      if (!response.ok) throw new Error("users unavailable");
      if (userId) setProfile(await response.json() as AdminUserRegistryRow);
      else setRegistry(await response.json() as AdminUserRegistryPage);
      setViewState("ready");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setViewState("unavailable");
    }
  }, [appliedQuery, page, pageSize, userId]);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  const signOut = async () => {
    await fetch("/api/admin/auth/sign-out", { method: "POST" }).catch(() => undefined);
    window.location.assign("/admin?view=login");
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setAppliedQuery(draftQuery.trim());
  };

  const title = userId ? "Профиль пользователя" : "Пользователи";

  return <div className="min-h-screen bg-[#F8FAFF] text-slate-900">
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
        <div className="mb-8 flex items-center gap-2 px-2 text-sm font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-primary"><Database size={17} /></span>2000NL Admin</div>
        <AdminUserNav permissions={operator?.permissions ?? []} active="users" />
        <div className="mt-auto border-t border-slate-100 pt-4"><div className="mb-3 flex items-center gap-2 px-2 text-xs text-slate-600"><span className="h-2 w-2 rounded-full bg-emerald-500" />Защищённая сессия</div><div className="flex items-center justify-between gap-2 px-2 text-xs"><span className="truncate text-slate-600" title={operator?.email}>{operator?.email || "Оператор"}</span><button aria-label="Выйти" onClick={() => void signOut()} className="rounded p-2 text-slate-500 hover:bg-slate-100"><LogOut size={16} /></button></div></div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:justify-end lg:px-7"><button className="inline-flex h-10 items-center gap-2 rounded px-2 text-sm font-semibold lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Открыть меню"><Menu size={19} />2000NL Admin</button><div className="flex items-center gap-3 text-xs text-slate-600"><span className="hidden sm:inline">{title}</span><span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-50 font-semibold text-primary">ОП</span></div></header>
        <main className="mx-auto min-h-[calc(100vh-56px)] w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {viewState === "loading" && <div className="space-y-4" role="status" aria-label="Загрузка"><div className="h-8 w-48 animate-pulse rounded bg-slate-200" /><div className="h-12 animate-pulse rounded-lg bg-white" /><div className="h-64 animate-pulse rounded-xl bg-white" /></div>}
          {viewState === "unauthorized" && <StatePanel title="Нужен вход оператора" description="Войдите через административную страницу, чтобы продолжить." action={<Link className="font-medium text-primary underline" href="/admin">Открыть вход</Link>} />}
          {viewState === "forbidden" && <StatePanel title="Нет разрешения на этот раздел" description="Для просмотра реестра требуется отдельное разрешение users.read." />}
          {viewState === "unavailable" && <StatePanel title="Не удалось загрузить сведения" description="Данные не изменены. Проверьте соединение и повторите запрос." action={<button onClick={() => void reload()} className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm">Повторить</button>} />}
          {viewState === "not-found" && <StatePanel title="Пользователь не найден" description="Запись могла быть удалена или идентификатор неверен." action={<Link className="font-medium text-primary underline" href="/admin/users">Вернуться к реестру</Link>} />}
          {viewState === "ready" && !userId && registry && <>
            <div className="mb-7"><h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Пользователи</h1><p className="mt-2 text-sm text-slate-600">Поиск и просмотр сохранённых сведений. Изменение аккаунтов здесь недоступно.</p></div>
            <form onSubmit={submitSearch} className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="relative min-w-0 flex-1 space-y-1 text-xs font-medium text-slate-600">Поиск по email или ID<span className="relative block"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} maxLength={128} className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-indigo-100" placeholder="Email или UUID пользователя" /></span></label>
              <button type="submit" className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-indigo-700">Найти</button>
              {appliedQuery && <button type="button" onClick={() => { setDraftQuery(""); setAppliedQuery(""); setPage(1); }} className="min-h-10 rounded-lg px-3 text-sm font-medium text-primary hover:bg-indigo-50">Сбросить</button>}
            </form>
            <p className="mb-3 text-xs leading-5 text-slate-500">Доступ и оплата не используются как фильтры: подтверждённый источник подписки пока не подключён. «Нет данных» отличается от подтверждённого нулевого счётчика.</p>
            {registry.items.length === 0 ? <StatePanel title={appliedQuery ? "Ничего не найдено" : "Пользователей пока нет"} description={appliedQuery ? "Проверьте email или идентификатор и попробуйте снова." : "Когда учётные записи появятся, они будут показаны здесь."} /> : <>
              <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block"><div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Пользователь", "Регистрация", "Последний вход", "Списки", "Ссылки на записи"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{registry.items.map((row) => <tr key={row.userId} className="border-t border-slate-100 hover:bg-slate-50"><td className="max-w-[360px] px-4 py-3"><Link href={`/admin/users/${row.userId}`} className="block min-h-9 rounded text-sm font-medium text-primary hover:underline">{row.email ?? "Email не указан"}<span className="mt-1 block font-mono text-[11px] font-normal text-slate-500">{shortId(row.userId)}</span></Link></td><td className="whitespace-nowrap px-4 py-3">{formatDate(row.createdAt)}</td><td className="whitespace-nowrap px-4 py-3">{formatDate(row.lastSignInAt)}</td><td className="px-4 py-3">{row.personalListCount}</td><td className="px-4 py-3">{row.personalEntryLinkCount}</td></tr>)}</tbody></table></div><RegistryPagination page={page} pageSize={pageSize} returned={registry.returned} hasNext={registry.hasNext} onPage={setPage} onPageSize={(value) => { setPageSize(value); setPage(1); }} /></div>
              <div className="space-y-3 sm:hidden">{registry.items.map((row) => <UserCard key={row.userId} row={row} />)}<RegistryPagination page={page} pageSize={pageSize} returned={registry.returned} hasNext={registry.hasNext} onPage={setPage} onPageSize={(value) => { setPageSize(value); setPage(1); }} /></div>
            </>}
          </>}
          {viewState === "ready" && userId && profile && <UserProfile row={profile} />}
        </main>
      </div>
    </div>
    {menuOpen && <div className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" onClick={() => setMenuOpen(false)}><aside onClick={(event) => event.stopPropagation()} className="flex h-full w-[min(300px,85vw)] flex-col bg-white p-4 shadow-xl"><div className="mb-8 flex items-center justify-between"><span className="font-semibold">2000NL Admin</span><button onClick={() => setMenuOpen(false)} aria-label="Закрыть меню" className="grid h-10 w-10 place-items-center rounded-lg"><X size={19} /></button></div><AdminUserNav permissions={operator?.permissions ?? []} active="users" /><div className="mt-auto border-t border-slate-100 pt-4"><p className="mb-3 break-all text-xs text-slate-500">{operator?.email}</p><button onClick={() => void signOut()} className="flex min-h-11 items-center gap-3 text-sm text-slate-600"><LogOut size={17} />Выйти</button></div></aside></div>}
  </div>;
}

function AdminUserNav({ permissions, active }: { permissions: string[]; active: "users" }) {
  const common = "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm";
  return <nav className="space-y-1" aria-label="Основная навигация">
    {permissions.includes("dictionaries.read") && <Link href="/admin" className={`${common} text-slate-600 hover:bg-slate-50`}><Database size={17} />Словари</Link>}
    {permissions.includes("users.read") && <Link href="/admin/users" aria-current={active === "users" ? "page" : undefined} className={`${common} ${active === "users" ? "bg-indigo-50 font-medium text-primary" : "text-slate-600 hover:bg-slate-50"}`}><Users size={17} />Пользователи</Link>}
    {permissions.includes("audit.read") && <Link href="/admin?view=journal" className={`${common} text-slate-600 hover:bg-slate-50`}><FileClock size={17} />Журнал</Link>}
  </nav>;
}

function UserCard({ row }: { row: AdminUserRegistryRow }) {
  return <Link href={`/admin/users/${row.userId}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200"><div className="break-words text-sm font-medium text-primary">{row.email ?? "Email не указан"}</div><p className="mt-1 break-all font-mono text-[11px] text-slate-500">{row.userId}</p><dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs"><dt className="text-slate-500">Регистрация</dt><dd>{formatDate(row.createdAt)}</dd><dt className="text-slate-500">Последний вход</dt><dd>{formatDate(row.lastSignInAt)}</dd><dt className="text-slate-500">Списки</dt><dd>{row.personalListCount}</dd><dt className="text-slate-500">Ссылки</dt><dd>{row.personalEntryLinkCount}</dd></dl></Link>;
}

function UserProfile({ row }: { row: AdminUserRegistryRow }) {
  return <>
    <div className="mb-5 text-xs text-slate-500"><Link href="/admin/users" className="hover:text-primary">Пользователи</Link><span className="mx-2">›</span>Профиль</div>
    <div className="mb-6 flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-50 font-semibold text-primary">{(row.email?.[0] ?? "?").toUpperCase()}</span><div className="min-w-0"><h1 className="break-all text-2xl font-semibold tracking-tight sm:text-[28px]">{row.email ?? "Пользователь"}</h1><p className="mt-1 font-mono text-xs text-slate-500">{row.userId} · Только просмотр</p></div></div>
    <div className="mb-5 flex gap-5 overflow-x-auto border-b border-slate-200 text-sm" role="tablist" aria-label="Разделы профиля">
      <ProfileTab label="Профиль" selected />
      <ProfileTab label="Активность" />
      <ProfileTab label="Контент" />
      <ProfileTab label="Доступ" />
      <ProfileTab label="Платежи" />
      <ProfileTab label="История" />
    </div>
    <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Статус тарифа, оплата и происхождение доступа не подтверждены источником данных. Значение <code className="rounded bg-amber-100 px-1">subscription_tier</code> не считается фактом активной подписки.</div>
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="mb-3 text-base font-semibold">Учётная запись</h2><dl><ProfileField label="Email" value={row.email ?? "Нет данных"} /><ProfileField label="ID пользователя" value={row.userId} /><ProfileField label="Зарегистрирован" value={formatDate(row.createdAt)} /><ProfileField label="Последний вход" value={formatDate(row.lastSignInAt)} /><ProfileField label="Активность в приложении" value="Нет данных" /></dl></section>
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="mb-3 text-base font-semibold">Личный контент</h2><dl><ProfileField label="Списки пользователя" value={String(row.personalListCount)} /><ProfileField label="Ссылки на словарные записи" value={String(row.personalEntryLinkCount)} /></dl><p className="mt-3 text-xs leading-5 text-slate-500">Содержимое списков не загружается в этой фазе. Для просмотра потребуется отдельное разрешение и событие аудита.</p></section>
    </div>
    <p className="mt-5 text-xs leading-5 text-slate-500">Вкладки «Активность», «Контент», «Доступ», «Платежи» и «История» зарезервированы. Они откроются только после подключения проверенных источников данных и соответствующих прав.</p>
  </>;
}

function ProfileTab({ label, selected = false }: { label: string; selected?: boolean }) {
  return <span role="tab" aria-selected={selected} aria-disabled={!selected} className={`-mb-px shrink-0 border-b-2 px-1 py-3 ${selected ? "border-primary font-medium text-primary" : "border-transparent text-slate-400"}`}>{label}</span>;
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 border-b border-slate-100 py-3 last:border-0 sm:grid-cols-[200px_1fr] sm:gap-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="min-w-0 break-words text-sm text-slate-900">{value}</dd></div>;
}

function RegistryPagination({ page, pageSize, returned, hasNext, onPage, onPageSize }: { page: number; pageSize: number; returned: number; hasNext: boolean; onPage: (value: number) => void; onPageSize: (value: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600"><span>Показано {returned} · страница {page}</span><div className="flex items-center gap-2"><label className="flex items-center gap-2">Строк<select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} className="h-9 rounded-md border border-slate-300 bg-white px-2"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><button aria-label="Предыдущая страница" disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 disabled:opacity-40">‹</button><button aria-label="Следующая страница" disabled={!hasNext} onClick={() => onPage(page + 1)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 disabled:opacity-40">›</button></div></div>;
}

function StatePanel({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8"><h1 className="text-lg font-semibold">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}
