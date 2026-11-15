import { NextRequest } from "next/server";
import { getAuthenticatedSupabase, jsonNoStore, platformCorsPreflight, requirePlatformScope, withPlatformCors, type AuthenticatedSupabase } from "./serverSupabase";
import { copyUuid } from "./independentEntryCopyContract";
import { parsePersonalCatalogPage, parsePersonalCatalogQuery } from "@/lib/collections/sharing/personalCatalogContract";
import { parseDetailsRecord } from "@/lib/collections/details/contract";
import { normalizeDictionaryContent } from "./projections/dictionaryContent";
import { dictionarySummaryFromLookupPayload, type DictionaryLookupPayload } from "./lookupService";
import { dictionaryEntrySourceStillReadable } from "./dictionaryEntryReadAuthority";

type Kind = "dictionaries" | "collections" | "entries" | "entry";
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max && !v.includes("\0");
const safeCount = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const bounded = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).byteLength <= 2 * 1024 * 1024;
export const catalogReadPreflight = platformCorsPreflight;
const publicContent = (row: DictionaryLookupPayload) => { const { sourceMeta: _sourceMeta, ...content } = normalizeDictionaryContent(row); return content; };

async function dictionaries(auth: AuthenticatedSupabase, languageCode: string) {
  const { data, error } = await auth.supabase.rpc("get_available_dictionary_sources", { p_user_id: auth.user.id, p_language_code: languageCode }).abortSignal(AbortSignal.timeout(10000));
  if (error) return { error: "dictionary_catalog_unavailable" as const };
  if (!Array.isArray(data) || data.length > 1000 || !data.every(row => record(row) && copyUuid(row.id) && text(row.name, 1000) && text(row.language_code, 16) && text(row.kind, 100) && safeCount(row.entry_count))) return { error: "dictionary_catalog_contract_invalid" as const };
  return { dictionaries: data.map(row => ({ id: row.id, name: row.name, languageCode: row.language_code, kind: row.kind, visibility: typeof row.visibility === "string" ? row.visibility : null, entryCount: row.entry_count })) };
}

/** Read-only companion surface. All database reads use caller-bound RPCs. */
export async function handlePlatformCatalogRead(request: NextRequest, kind: Kind, collectionId?: string) {
  const reply = (data: unknown, status = 200) => withPlatformCors(request, jsonNoStore(data, status));
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return withPlatformCors(request, auth);
  const denied = requirePlatformScope(auth, "platform:read");
  if (denied) return withPlatformCors(request, denied);
  const params = request.nextUrl.searchParams;
  const allowed = kind === "entry" ? [] : kind === "dictionaries" ? ["languageCode"] : kind === "collections" ? ["languageCode", "query", "limit", "cursor"] : ["query", "page", "pageSize"];
  if (request.nextUrl.search.length > 16000 || [...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) return reply({ error: "invalid_catalog_request" }, 400);
  const languageCode = params.get("languageCode") ?? "nl";
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(languageCode) || languageCode.length > 16) return reply({ error: "invalid_language" }, 400);
  const query = params.get("query") ?? "";
  if (!text(query, 100)) return reply({ error: "invalid_query" }, 400);
  try {
    if (kind === "dictionaries") {
      const result = await dictionaries(auth, languageCode);
      return result.error ? reply(result, result.error.endsWith("invalid") ? 502 : 503) : reply(result);
    }
    if (kind === "entry") {
      if (!copyUuid(collectionId)) return reply({ error: "invalid_entry_id" }, 400);
      const { data, error } = await auth.supabase.rpc("fetch_dictionary_entry_by_id_gated", { p_entry_id: collectionId }).abortSignal(AbortSignal.timeout(10000));
      if (error) return reply({ error: "entry_unavailable" }, error.code === "42501" ? 404 : 503);
      if (data === null) return reply({ error: "entry_unavailable" }, 404);
      if (!record(data) || data.id !== collectionId.toLowerCase() || !text(data.headword, 1000) || !record(data.raw)) return reply({ error: "entry_contract_invalid" }, 502);
      const row = data as DictionaryLookupPayload;
      const content = publicContent(row);
      const result = { item: { entry: { id: row.id, dictionaryId: row.dictionary_id ?? null, languageCode: row.language_code ?? null, headword: row.headword, meaningId: content.meaningId, partOfSpeech: row.part_of_speech ?? null, content }, dictionary: row.dictionary_id ? { ...dictionarySummaryFromLookupPayload(row), visibility: row.dictionary?.visibility ?? null } : null } };
      if (!await dictionaryEntrySourceStillReadable(auth, row)) return reply({ error: "entry_changed" }, 409);
      return bounded(result) ? reply(result) : reply({ error: "entry_response_too_large" }, 502);
    }
    if (kind === "collections") {
      const limitText = params.get("limit") ?? "50";
      if (!/^[1-9][0-9]{0,2}$/.test(limitText)) return reply({ error: "invalid_limit" }, 400);
      let cursor: unknown = null;
      try { if (params.has("cursor")) cursor = JSON.parse(params.get("cursor")!); } catch { return reply({ error: "invalid_catalog_cursor" }, 400); }
      const input = parsePersonalCatalogQuery({ query, limit: Number(limitText), cursor, languageCode, ownership: "owned" });
      if (!input) return reply({ error: "invalid_catalog_request" }, 400);
      const { data, error } = await auth.supabase.rpc("read_personal_collection_catalog_v2", { p_query: input.query, p_sort: input.sort, p_scope: input.scope, p_label_id: null, p_language_code: input.languageCode, p_cursor: input.cursor, p_limit: input.limit, p_ownership: "owned" }).abortSignal(AbortSignal.timeout(10000));
      if (error) return reply({ error: "collection_catalog_unavailable" }, 503);
      const page = parsePersonalCatalogPage(data, input.limit, "owned");
      return page ? reply(page) : reply({ error: "collection_catalog_contract_invalid" }, 502);
    }
    if (!copyUuid(collectionId)) return reply({ error: "invalid_collection_id" }, 400);
    const pageText = params.get("page") ?? "1", pageSizeText = params.get("pageSize") ?? "25";
    if (!/^[1-9][0-9]{0,3}$/.test(pageText) || !/^[1-9][0-9]{0,2}$/.test(pageSizeText) || Number(pageSizeText) > 50) return reply({ error: "invalid_page" }, 400);
    const page = Number(pageText), pageSize = Number(pageSizeText);
    const { data: detailsData, error: detailsError } = await auth.supabase.rpc("read_collection_details_v1", { p_collection_id: collectionId }).abortSignal(AbortSignal.timeout(10000));
    if (detailsError) return reply({ error: "collection_unavailable" }, detailsError.code === "42501" ? 404 : 503);
    const details = parseDetailsRecord(detailsData);
    if (!details || details.id !== collectionId.toLowerCase()) return reply({ error: "collection_contract_invalid" }, 502);
    if (!details.isOwner) return reply({ error: "collection_unavailable" }, 404);
    const { data, error } = await auth.supabase.rpc("fetch_library_collection_entries", { p_list_id: collectionId, p_list_type: "user", p_filters: { parts: [], article: null }, p_query: query || null, p_language_code: null, p_page: page, p_page_size: pageSize }).abortSignal(AbortSignal.timeout(10000));
    if (error) return reply({ error: "collection_entries_unavailable" }, error.code === "42501" ? 404 : 503);
    if (!record(data) || !Array.isArray(data.items) || data.items.length > pageSize || !safeCount(data.total) || typeof data.is_locked !== "boolean" || (data.max_allowed !== null && !safeCount(data.max_allowed)) || !data.items.every(row => record(row) && copyUuid(row.id) && copyUuid(row.dictionary_id) && text(row.language_code, 16) && text(row.headword, 1000) && record(row.raw))) return reply({ error: "collection_entries_contract_invalid" }, 502);
    const items = data.items.map(row => { const content = publicContent(row as DictionaryLookupPayload); return { id: row.id, dictionaryId: row.dictionary_id, languageCode: row.language_code, headword: row.headword, meaningId: content.meaningId, partOfSpeech: row.part_of_speech ?? null, content }; });
    const recheck = await auth.supabase.rpc("read_collection_details_v1", { p_collection_id: collectionId }).abortSignal(AbortSignal.timeout(10000));
    const current = parseDetailsRecord(recheck.data);
    if (recheck.error || !current?.isOwner || current.id !== details.id || current.revision !== details.revision) return reply({ error: "collection_changed" }, 409);
    const result = { collection: { id: details.id, name: details.name, description: details.description, revision: details.revision }, items, total: data.total, page, pageSize, hasMore: page * pageSize < data.total && (!safeCount(data.max_allowed) || page * pageSize < data.max_allowed), isLocked: data.is_locked, maxAllowed: data.max_allowed };
    return bounded(result) ? reply(result) : reply({ error: "collection_response_too_large" }, 502);
  } catch { return reply({ error: "catalog_unavailable" }, 503); }
}
