import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  projectDictionaryMetadata,
  projectDictionaryRegistryPage,
  type DictionaryMetadata,
  type DictionaryRecord,
  type DictionaryRegistryFilters,
  type DictionaryRegistryPage,
} from "./dictionaryContract";

const DICTIONARY_COLUMNS =
  "id,slug,name,language_code,kind,visibility,owner_user_id,source_provider,source_version,schema_key,schema_version,is_editable,minimum_subscription_tier,description,created_at,updated_at,dictionary_schemas(title,retired_at)";

function createAdminReadClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Admin dictionary source is not configured");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildDictionarySearchFilter(query: string): string {
  const pattern = `*${escapeLike(query)}*`;
  const safe = quotePostgrestValue(pattern);
  return `name.ilike.${safe},slug.ilike.${safe}`;
}

export async function listAdminDictionaries(
  filters: DictionaryRegistryFilters,
): Promise<DictionaryRegistryPage> {
  const client = createAdminReadClient();
  const start = (filters.page - 1) * filters.pageSize;
  let query = client
    .from("dictionaries")
    .select(DICTIONARY_COLUMNS)
    .order("name", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .range(start, start + filters.pageSize);

  if (filters.q) query = query.or(buildDictionarySearchFilter(filters.q));
  if (filters.language) query = query.eq("language_code", filters.language);
  if (filters.kind) query = query.eq("kind", filters.kind);

  const { data, error } = await query;
  if (error) throw new Error("Admin dictionary registry read failed");

  const records = (data ?? []) as unknown as DictionaryRecord[];
  return projectDictionaryRegistryPage(records, filters);
}

export async function getAdminDictionaryMetadata(
  id: string,
): Promise<DictionaryMetadata | null> {
  const client = createAdminReadClient();
  const { data, error } = await client
    .from("dictionaries")
    .select(DICTIONARY_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Admin dictionary metadata read failed");
  return data ? projectDictionaryMetadata(data as unknown as DictionaryRecord) : null;
}
