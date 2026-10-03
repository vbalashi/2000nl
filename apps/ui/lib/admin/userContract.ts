export type AdminUserRegistryQuery = {
  query: string | null;
  page: number;
  pageSize: 25 | 50 | 100;
};

export type AdminUserRegistryRow = {
  userId: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  personalListCount: number;
  personalEntryLinkCount: number;
};

export type AdminUserRegistryPage = {
  items: AdminUserRegistryRow[];
  hasNext: boolean;
  page: number;
  pageSize: number;
  returned: number;
};

const PAGE_SIZES = [25, 50, 100] as const;

export function parseAdminUserRegistryQuery(params: URLSearchParams): AdminUserRegistryQuery {
  const rawQuery = (params.get("q") ?? "").trim();
  const rawPage = Number(params.get("page"));
  const rawPageSize = Number(params.get("pageSize"));
  return {
    query: rawQuery ? rawQuery.slice(0, 128) : null,
    page: Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10_000) : 1,
    pageSize: PAGE_SIZES.includes(rawPageSize as (typeof PAGE_SIZES)[number])
      ? rawPageSize as AdminUserRegistryQuery["pageSize"]
      : 25,
  };
}

export function projectAdminUserRegistryRow(value: Record<string, unknown>): AdminUserRegistryRow | null {
  if (
    typeof value.user_id !== "string" ||
    typeof value.created_at !== "string" ||
    !Number.isSafeInteger(value.personal_list_count) ||
    !Number.isSafeInteger(value.personal_entry_link_count)
  ) return null;

  return {
    userId: value.user_id,
    email: typeof value.email === "string" ? value.email : null,
    createdAt: value.created_at,
    lastSignInAt: typeof value.last_sign_in_at === "string" ? value.last_sign_in_at : null,
    personalListCount: value.personal_list_count as number,
    personalEntryLinkCount: value.personal_entry_link_count as number,
  };
}
