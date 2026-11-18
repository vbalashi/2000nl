const consolePath = "/admin/reports/";

export const adminConsolePermissions = {
  dictionaries: "dictionaries.read",
  detail: "dictionaries.read",
  reports: "feedback.read",
  users: "users.read",
  journal: "audit.read",
  notifications: "notifications.manage",
} as const;

type ConsoleView = keyof typeof adminConsolePermissions;

export type AdminSearchParams = Record<string, string | string[] | undefined>;

const registryFilters = ["q", "language", "kind", "page", "pageSize"];
const journalFilters = ["action", "period", "before", "page", "pageSize"];

export function firstAdminParam(value: AdminSearchParams[string]) {
  return Array.isArray(value) ? value[0] : value;
}

function consoleHref(view: ConsoleView, params = new URLSearchParams()) {
  if (view !== "reports") params.set("view", view);
  return params.size ? `${consolePath}?${params}` : consolePath;
}

export const adminConsoleHome = consoleHref("dictionaries");

export function adminLegacyDestination(search: AdminSearchParams) {
  const view = firstAdminParam(search.view);
  if (view === "login" || firstAdminParam(search.returnTo)) return null;

  const section = view === "journal" || view === "detail" ? view : "dictionaries";
  const filters = section === "journal" ? journalFilters : registryFilters;
  const params = new URLSearchParams();
  for (const filter of filters) {
    const value = firstAdminParam(search[filter]);
    if (value) params.set(filter, value);
  }
  const id = firstAdminParam(search.id);
  if (section === "detail" && id) params.set("id", id);
  return consoleHref(section, params);
}

export function adminUserDestination(id?: string) {
  return consoleHref("users", new URLSearchParams(id ? { id } : undefined));
}

/** Resolve a known same-origin console destination against verified permissions. */
export function adminReturnPath(value: string | null, origin: string, permissions: readonly string[], unified = false) {
  if (!value) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || (url.pathname !== consolePath && url.pathname !== "/admin/reports")) return null;
    const view = url.searchParams.get("view") ?? "reports";
    if (!unified && view !== "reports" && view !== "notifications") return null;
    if (!Object.hasOwn(adminConsolePermissions, view)) return null;
    return permissions.includes(adminConsolePermissions[view as ConsoleView]) ? url.pathname + url.search : null;
  } catch {
    return null;
  }
}

export function requestedAdminReturn() {
  const fromUrl = new URLSearchParams(window.location.search).get("returnTo");
  if (fromUrl) return fromUrl;
  try {
    return window.sessionStorage.getItem("admin.returnTo");
  } catch {
    return null;
  }
}
