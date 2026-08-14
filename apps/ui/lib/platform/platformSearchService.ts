import type { AuthenticatedSupabase, ServiceSupabase } from "./serverSupabase";
import { asRecord, type PlatformOperationResult } from "./platformApiContracts";
import {
  formatPlatformServerTiming,
  measurePlatformTiming,
  type PlatformTimingEntry,
} from "./platformOperationTiming";

export async function performPlatformSearch(
  auth: AuthenticatedSupabase,
  params: {
    query: string;
    languageCode?: string | null;
    dictionaryIds?: string[] | null;
    group?: string | null;
    limit?: number | null;
    cursor?: string | null;
  },
): Promise<PlatformOperationResult> {
  const {
    query,
    languageCode = null,
    dictionaryIds = null,
    group = null,
    limit = 6,
    cursor = null,
  } = params;
  if (!query) {
    return { payload: { error: "missing_query" }, status: 400 };
  }
  const timings: PlatformTimingEntry[] = [];
  const { data, error } = await measurePlatformTiming(timings, "search.db", async () =>
    await auth.supabase.rpc("search_dictionary_groups_v1", {
      p_query: query,
      p_language_code: languageCode,
      p_dictionary_ids: dictionaryIds,
      p_group: group,
      p_limit: limit,
      p_cursor: cursor,
    }),
  );
  const serverTiming = () => formatPlatformServerTiming(timings);

  if (error) {
    return {
      payload: { error: "search_failed", detail: error.message ?? String(error) },
      status: 500,
      serverTiming: serverTiming(),
    };
  }

  const payload = asRecord(data);
  if (payload.error === "search_index_not_ready") {
    return {
      payload,
      status: 503,
      serverTiming: serverTiming(),
    };
  }

  return {
    payload: data,
    status: 200,
    serverTiming: serverTiming(),
  };
}

export async function performPlatformCatalogSearch(
  service: ServiceSupabase,
  params: {
    query: string;
    languageCode?: string | null;
    group?: string | null;
    limit?: number | null;
    cursor?: string | null;
  },
): Promise<PlatformOperationResult> {
  const {
    query,
    languageCode = null,
    group = null,
    limit = 6,
    cursor = null,
  } = params;
  if (!query) {
    return { payload: { error: "missing_query" }, status: 400 };
  }
  const timings: PlatformTimingEntry[] = [];
  const { data, error } = await measurePlatformTiming(timings, "search.db", async () =>
    await service.supabase.rpc("search_public_dictionary_groups_v1", {
      p_query: query,
      p_language_code: languageCode,
      p_group: group,
      p_limit: limit,
      p_cursor: cursor,
    }),
  );
  const serverTiming = () => formatPlatformServerTiming(timings);

  if (error) {
    return {
      payload: {
        error: "catalog_search_failed",
        detail: error.message ?? String(error),
      },
      status: 500,
      serverTiming: serverTiming(),
    };
  }

  const payload = asRecord(data);
  if (payload.error === "search_index_not_ready") {
    return {
      payload,
      status: 503,
      serverTiming: serverTiming(),
    };
  }

  return {
    payload: data,
    status: 200,
    serverTiming: serverTiming(),
  };
}


