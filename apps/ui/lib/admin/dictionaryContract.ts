export const ADMIN_DICTIONARY_KINDS = ["curated", "user"] as const;
export type AdminDictionaryKind = (typeof ADMIN_DICTIONARY_KINDS)[number];

export const ADMIN_DICTIONARY_VISIBILITIES = [
  "system",
  "private",
  "shared",
  "public",
] as const;
export type AdminDictionaryVisibility =
  (typeof ADMIN_DICTIONARY_VISIBILITIES)[number];

export const ADMIN_PAGE_SIZES = [25, 50, 100] as const;
const MAX_REGISTRY_PAGE = 10_000;
export type AdminPageSize = (typeof ADMIN_PAGE_SIZES)[number];

export type DictionaryRegistryFilters = {
  q: string;
  language: string;
  kind: "" | AdminDictionaryKind;
  page: number;
  pageSize: AdminPageSize;
};

export type DictionaryRegistryRow = {
  id: string;
  slug: string;
  name: string;
  languageCode: string;
  kind: AdminDictionaryKind | null;
  visibility: AdminDictionaryVisibility | null;
  ownerId: string | null;
  sourceProvider: string | null;
  schemaKey: string | null;
  schemaVersion: number | null;
  updatedAt: string | null;
  entryCount: null;
};

export type DictionaryRegistryPage = {
  items: DictionaryRegistryRow[];
  page: number;
  pageSize: AdminPageSize;
  hasPrevious: boolean;
  hasNext: boolean;
  returned: number;
};

export type DictionaryMetadata = DictionaryRegistryRow & {
  description: string | null;
  editable: boolean | null;
  minimumSubscriptionTier: string | null;
  sourceVersion: string | null;
  createdAt: string | null;
  schemaTitle: string | null;
  schemaRetiredAt: string | null;
};

export type DictionaryRecord = {
  id: unknown;
  slug: unknown;
  name: unknown;
  language_code: unknown;
  kind: unknown;
  visibility: unknown;
  owner_user_id: unknown;
  source_provider: unknown;
  source_version: unknown;
  schema_key: unknown;
  schema_version: unknown;
  is_editable: unknown;
  minimum_subscription_tier: unknown;
  description: unknown;
  created_at: unknown;
  updated_at: unknown;
  dictionary_schemas?: {
    title?: unknown;
    retired_at?: unknown;
  } | null;
};

export function parseDictionaryFilters(searchParams: URLSearchParams): DictionaryRegistryFilters {
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage > 0
    ? Math.min(rawPage, MAX_REGISTRY_PAGE)
    : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize = ADMIN_PAGE_SIZES.includes(rawSize as AdminPageSize)
    ? (rawSize as AdminPageSize)
    : 25;
  const rawKind = searchParams.get("kind") ?? "";
  const kind = ADMIN_DICTIONARY_KINDS.includes(rawKind as AdminDictionaryKind)
    ? (rawKind as AdminDictionaryKind)
    : "";

  return {
    q: (searchParams.get("q") ?? "").trim().slice(0, 120),
    language: (searchParams.get("language") ?? "").trim().slice(0, 16),
    kind,
    page,
    pageSize,
  };
}

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const enumOrNull = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  typeof value === "string" && allowed.includes(value as T) ? (value as T) : null;

export function projectDictionaryRow(record: DictionaryRecord): DictionaryRegistryRow {
  return {
    id: typeof record.id === "string" ? record.id : "",
    slug: typeof record.slug === "string" ? record.slug : "",
    name: typeof record.name === "string" ? record.name : "",
    languageCode: typeof record.language_code === "string" ? record.language_code : "",
    kind: enumOrNull(record.kind, ADMIN_DICTIONARY_KINDS),
    visibility: enumOrNull(record.visibility, ADMIN_DICTIONARY_VISIBILITIES),
    ownerId: stringOrNull(record.owner_user_id),
    sourceProvider: stringOrNull(record.source_provider),
    schemaKey: stringOrNull(record.schema_key),
    schemaVersion: numberOrNull(record.schema_version),
    updatedAt: stringOrNull(record.updated_at),
    entryCount: null,
  };
}

export function projectDictionaryMetadata(record: DictionaryRecord): DictionaryMetadata {
  return {
    ...projectDictionaryRow(record),
    description: stringOrNull(record.description),
    editable: typeof record.is_editable === "boolean" ? record.is_editable : null,
    minimumSubscriptionTier: stringOrNull(record.minimum_subscription_tier),
    sourceVersion: stringOrNull(record.source_version),
    createdAt: stringOrNull(record.created_at),
    schemaTitle: stringOrNull(record.dictionary_schemas?.title),
    schemaRetiredAt: stringOrNull(record.dictionary_schemas?.retired_at),
  };
}

export function projectDictionaryRegistryPage(
  records: DictionaryRecord[],
  filters: DictionaryRegistryFilters,
): DictionaryRegistryPage {
  const hasNext = records.length > filters.pageSize;
  const visible = records.slice(0, filters.pageSize);
  return {
    items: visible.map(projectDictionaryRow),
    page: filters.page,
    pageSize: filters.pageSize,
    hasPrevious: filters.page > 1,
    hasNext,
    returned: visible.length,
  };
}
