import type { AuthenticatedSupabase, ServiceSupabase } from "./serverSupabase";

type QueryResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

type EventRow = {
  id: string;
  user_id: string;
  entry_id: string;
  card_type_id: string;
  action: string;
  result: string | null;
  client_event_id: string | null;
  turn_id: string | null;
  source_id: string | null;
  location_id: string | null;
  artifact_id: string | null;
  clicked_form: string | null;
  context_text_hash: string | null;
  auth_kind: string | null;
  connected_client_id: string | null;
  created_at: string;
};

type SourceRow = {
  id: string;
  kind: string;
  provider: string | null;
  external_id: string | null;
  canonical_url: string | null;
  language_code: string | null;
};

type LocationRow = {
  id: string;
  source_id: string;
  artifact_id: string | null;
  locator_kind: string;
  start_ms: number | null;
  end_ms: number | null;
  phrase_index: number | null;
  text_hash: string | null;
};

type ArtifactRow = {
  id: string;
  source_id: string;
  artifact_kind: string;
  producer: string;
  snapshot_revision_id: string | null;
  text_source_id: string | null;
  text_source_revision_id: string | null;
  text_content_fingerprint: string | null;
  timing_evidence_revision_id: string | null;
  phrase_set_revision_id: string | null;
  builder_version: string | null;
  language_code: string | null;
  quality: string | null;
};

type CardStateRow = {
  entry_id?: string;
  card_type_id?: string;
  click_count?: number | null;
  seen_count?: number | null;
  success_count?: number | null;
  last_seen_at?: string | null;
  last_reviewed_at?: string | null;
  next_review_at?: string | null;
  hidden?: boolean | null;
  frozen_until?: string | null;
  in_learning?: boolean | null;
  learning_due_at?: string | null;
  fsrs_stability?: number | null;
  fsrs_difficulty?: number | null;
  fsrs_reps?: number | null;
  fsrs_lapses?: number | null;
  fsrs_last_grade?: number | null;
  fsrs_last_interval?: number | null;
  fsrs_params_version?: string | null;
};

export type LearningReadFilters = {
  occurredAfter?: string;
  occurredBefore?: string;
  sourceKind?: string;
  sourceProvider?: string;
  sourceExternalId?: string;
  sourceId?: string;
  artifactId?: string;
  phraseSetRevisionId?: string;
  action?: string;
  result?: string;
  entryId?: string;
  cardTypeId?: string;
  connectedClientId?: string;
  cursor?: string;
  limit: number;
};

type ActivityCursor = {
  createdAt: string;
  id: string;
};

type CardsCursor = {
  createdAt: string;
  id: string;
};

export type LearningReadResult = {
  payload: unknown;
  status: number;
};

function encodeCursor(value: ActivityCursor | CardsCursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): ActivityCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof decoded.createdAt !== "string" || typeof decoded.id !== "string") {
      return null;
    }
    if (Number.isNaN(Date.parse(decoded.createdAt)) || !decoded.id) {
      return null;
    }
    return { createdAt: decoded.createdAt, id: decoded.id };
  } catch {
    return null;
  }
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

function isValidDate(value: string | undefined): boolean {
  return !value || !Number.isNaN(Date.parse(value));
}

function invalidFilterError(field: string): LearningReadResult {
  return {
    payload: { error: "invalid_filter", field },
    status: 400,
  };
}

function selectEventColumns() {
  return [
    "id",
    "user_id",
    "entry_id",
    "card_type_id",
    "action",
    "result",
    "client_event_id",
    "turn_id",
    "source_id",
    "location_id",
    "artifact_id",
    "clicked_form",
    "context_text_hash",
    "auth_kind",
    "connected_client_id",
    "created_at",
  ].join(",");
}

async function resolveSourceIds(
  service: ServiceSupabase,
  filters: LearningReadFilters,
): Promise<{ ids: string[] | null; error?: LearningReadResult }> {
  const hasSourceTableFilter = Boolean(
    filters.sourceId ||
      filters.sourceKind ||
      filters.sourceProvider ||
      filters.sourceExternalId,
  );
  if (!hasSourceTableFilter) return { ids: null };

  let query: any = service.supabase.from("learning_sources").select("id");
  if (filters.sourceId) query = query.eq("id", filters.sourceId);
  if (filters.sourceKind) query = query.eq("kind", filters.sourceKind);
  if (filters.sourceProvider) query = query.eq("provider", filters.sourceProvider);
  if (filters.sourceExternalId) query = query.eq("external_id", filters.sourceExternalId);

  const { data, error } = (await query) as QueryResult<{ id: string }>;
  if (error) {
    return {
      ids: [],
      error: {
        payload: { error: "source_filter_failed", detail: error.message ?? String(error) },
        status: 500,
      },
    };
  }

  return { ids: unique((data ?? []).map((row) => row.id)) };
}

async function resolveArtifactIds(
  service: ServiceSupabase,
  filters: LearningReadFilters,
): Promise<{ ids: string[] | null; error?: LearningReadResult }> {
  if (!filters.artifactId && !filters.phraseSetRevisionId) return { ids: null };

  let query: any = service.supabase.from("learning_source_artifacts").select("id");
  if (filters.artifactId) query = query.eq("id", filters.artifactId);
  if (filters.phraseSetRevisionId) {
    query = query.eq("phrase_set_revision_id", filters.phraseSetRevisionId);
  }

  const { data, error } = (await query) as QueryResult<{ id: string }>;
  if (error) {
    return {
      ids: [],
      error: {
        payload: { error: "artifact_filter_failed", detail: error.message ?? String(error) },
        status: 500,
      },
    };
  }

  return { ids: unique((data ?? []).map((row) => row.id)) };
}

function applyEventFilters(
  baseQuery: any,
  filters: LearningReadFilters,
  sourceIds: string[] | null,
  artifactIds: string[] | null,
) {
  let query = baseQuery;
  if (filters.occurredAfter) query = query.gte("created_at", filters.occurredAfter);
  if (filters.occurredBefore) query = query.lte("created_at", filters.occurredBefore);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.result) query = query.eq("result", filters.result);
  if (filters.entryId) query = query.eq("entry_id", filters.entryId);
  if (filters.cardTypeId) query = query.eq("card_type_id", filters.cardTypeId);
  if (filters.connectedClientId) {
    query = query.eq("connected_client_id", filters.connectedClientId);
  }
  if (sourceIds) query = query.in("source_id", sourceIds);
  if (artifactIds) query = query.in("artifact_id", artifactIds);

  const cursor = decodeCursor(filters.cursor);
  if (filters.cursor && !cursor) {
    return {
      query,
      error: invalidFilterError("cursor"),
    };
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }
  return { query };
}

async function fetchEvents(
  auth: AuthenticatedSupabase,
  service: ServiceSupabase,
  filters: LearningReadFilters,
  limit: number,
): Promise<{ rows: EventRow[]; error?: LearningReadResult }> {
  const sourceResolution = await resolveSourceIds(service, filters);
  if (sourceResolution.error) return { rows: [], error: sourceResolution.error };
  if (sourceResolution.ids && sourceResolution.ids.length === 0) return { rows: [] };

  const artifactResolution = await resolveArtifactIds(service, filters);
  if (artifactResolution.error) return { rows: [], error: artifactResolution.error };
  if (artifactResolution.ids && artifactResolution.ids.length === 0) return { rows: [] };

  const baseQuery = service.supabase
    .from("user_card_action_events")
    .select(selectEventColumns())
    .eq("user_id", auth.user.id);
  const filtered = applyEventFilters(
    baseQuery,
    filters,
    sourceResolution.ids,
    artifactResolution.ids,
  );
  if (filtered.error) return { rows: [], error: filtered.error };

  const query = filtered.query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  const { data, error } = (await query) as QueryResult<EventRow>;
  if (error) {
    return {
      rows: [],
      error: {
        payload: { error: "learning_activity_failed", detail: error.message ?? String(error) },
        status: 500,
      },
    };
  }
  return { rows: data ?? [] };
}

async function fetchRowsById<T extends { id: string }>(
  service: ServiceSupabase,
  table: string,
  ids: string[],
  columns: string,
): Promise<Map<string, T>> {
  if (ids.length === 0) return new Map();
  const { data, error } = (await service.supabase
    .from(table)
    .select(columns)
    .in("id", ids)) as QueryResult<T>;
  if (error) throw new Error(error.message ?? String(error));
  return new Map((data ?? []).map((row) => [row.id, row]));
}

async function fetchContextMaps(service: ServiceSupabase, events: EventRow[]) {
  const sourceIds = unique(events.map((event) => event.source_id));
  const locationIds = unique(events.map((event) => event.location_id));
  const artifactIds = unique(events.map((event) => event.artifact_id));

  const [sources, locations, artifacts] = await Promise.all([
    fetchRowsById<SourceRow>(
      service,
      "learning_sources",
      sourceIds,
      "id,kind,provider,external_id,canonical_url,language_code",
    ),
    fetchRowsById<LocationRow>(
      service,
      "learning_source_locations",
      locationIds,
      "id,source_id,artifact_id,locator_kind,start_ms,end_ms,phrase_index,text_hash",
    ),
    fetchRowsById<ArtifactRow>(
      service,
      "learning_source_artifacts",
      artifactIds,
      [
        "id",
        "source_id",
        "artifact_kind",
        "producer",
        "snapshot_revision_id",
        "text_source_id",
        "text_source_revision_id",
        "text_content_fingerprint",
        "timing_evidence_revision_id",
        "phrase_set_revision_id",
        "builder_version",
        "language_code",
        "quality",
      ].join(","),
    ),
  ]);

  return { sources, locations, artifacts };
}

function mapSource(row: SourceRow | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    externalId: row.external_id,
    canonicalUrl: row.kind === "youtube_video" ? row.canonical_url : null,
    languageCode: row.language_code,
  };
}

function mapLocation(row: LocationRow | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    sourceId: row.source_id,
    artifactId: row.artifact_id,
    kind: row.locator_kind,
    startMs: row.start_ms,
    endMs: row.end_ms,
    phraseIndex: row.phrase_index,
    textHash: row.text_hash,
  };
}

function mapArtifact(row: ArtifactRow | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    sourceId: row.source_id,
    kind: row.artifact_kind,
    producer: row.producer,
    snapshotRevisionId: row.snapshot_revision_id,
    textSourceId: row.text_source_id,
    textSourceRevisionId: row.text_source_revision_id,
    textContentFingerprint: row.text_content_fingerprint,
    timingEvidenceRevisionId: row.timing_evidence_revision_id,
    phraseSetRevisionId: row.phrase_set_revision_id,
    builderVersion: row.builder_version,
    languageCode: row.language_code,
    quality: row.quality,
  };
}

function mapEvent(
  event: EventRow,
  maps: Awaited<ReturnType<typeof fetchContextMaps>>,
) {
  return {
    id: event.id,
    occurredAt: event.created_at,
    action: event.action,
    result: event.result,
    clientEventId: event.client_event_id,
    turnId: event.turn_id,
    entry: {
      id: event.entry_id,
      cardTypeId: event.card_type_id,
    },
    source: mapSource(event.source_id ? maps.sources.get(event.source_id) : undefined),
    artifact: mapArtifact(
      event.artifact_id ? maps.artifacts.get(event.artifact_id) : undefined,
    ),
    location: mapLocation(
      event.location_id ? maps.locations.get(event.location_id) : undefined,
    ),
    selection: {
      clickedForm: event.clicked_form,
      contextTextHash: event.context_text_hash,
    },
    actor: {
      authKind: event.auth_kind ?? "first_party",
      connectedClientId: event.connected_client_id,
    },
  };
}

function mapCardState(row: CardStateRow) {
  return {
    entryId: row.entry_id ?? null,
    cardTypeId: row.card_type_id ?? null,
    clickCount: row.click_count ?? 0,
    seenCount: row.seen_count ?? 0,
    successCount: row.success_count ?? 0,
    lastSeenAt: row.last_seen_at ?? null,
    lastReviewedAt: row.last_reviewed_at ?? null,
    nextReviewAt: row.next_review_at ?? null,
    hidden: row.hidden ?? false,
    frozenUntil: row.frozen_until ?? null,
    inLearning: row.in_learning ?? false,
    learningDueAt: row.learning_due_at ?? null,
    fsrs: {
      stability: row.fsrs_stability ?? null,
      difficulty: row.fsrs_difficulty ?? null,
      reps: row.fsrs_reps ?? 0,
      lapses: row.fsrs_lapses ?? 0,
      lastGrade: row.fsrs_last_grade ?? null,
      lastInterval: row.fsrs_last_interval ?? null,
      paramsVersion: row.fsrs_params_version ?? null,
    },
  };
}

async function fetchCardStates(auth: AuthenticatedSupabase, events: EventRow[]) {
  const entryIds = unique(events.map((event) => event.entry_id));
  const cardTypeIds = unique(events.map((event) => event.card_type_id));
  if (entryIds.length === 0 || cardTypeIds.length === 0) return new Map<string, unknown>();

  const { data, error } = await auth.supabase.rpc("get_user_card_states_for_entries", {
    p_user_id: auth.user.id,
    p_entry_ids: entryIds,
    p_card_type_ids: cardTypeIds,
  });
  if (error) throw new Error(error.message ?? String(error));

  const states = new Map<string, unknown>();
  for (const row of Array.isArray(data) ? (data as CardStateRow[]) : []) {
    if (!row.entry_id || !row.card_type_id) continue;
    states.set(`${row.entry_id}:${row.card_type_id}`, mapCardState(row));
  }
  return states;
}

export function parseLearningReadFilters(url: URL): LearningReadFilters | LearningReadResult {
  const limitValue = url.searchParams.get("limit");
  const filters: LearningReadFilters = {
    occurredAfter: url.searchParams.get("occurredAfter") ?? undefined,
    occurredBefore: url.searchParams.get("occurredBefore") ?? undefined,
    sourceKind: url.searchParams.get("sourceKind") ?? undefined,
    sourceProvider: url.searchParams.get("sourceProvider") ?? undefined,
    sourceExternalId: url.searchParams.get("sourceExternalId") ?? undefined,
    sourceId: url.searchParams.get("sourceId") ?? undefined,
    artifactId: url.searchParams.get("artifactId") ?? undefined,
    phraseSetRevisionId: url.searchParams.get("phraseSetRevisionId") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    result: url.searchParams.get("result") ?? undefined,
    entryId: url.searchParams.get("entryId") ?? undefined,
    cardTypeId: url.searchParams.get("cardTypeId") ?? undefined,
    connectedClientId: url.searchParams.get("connectedClientId") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: normalizeLimit(limitValue ? Number(limitValue) : 50),
  };

  if (!isValidDate(filters.occurredAfter)) return invalidFilterError("occurredAfter");
  if (!isValidDate(filters.occurredBefore)) return invalidFilterError("occurredBefore");
  if (filters.cursor && !decodeCursor(filters.cursor)) return invalidFilterError("cursor");

  return filters;
}

export async function readPlatformLearningActivity(
  auth: AuthenticatedSupabase,
  service: ServiceSupabase,
  filters: LearningReadFilters,
): Promise<LearningReadResult> {
  const limit = normalizeLimit(filters.limit);
  const { rows, error } = await fetchEvents(auth, service, filters, limit + 1);
  if (error) return error;

  const pageRows = rows.slice(0, limit);
  const nextRow = rows.length > limit ? pageRows[pageRows.length - 1] : null;
  try {
    const maps = await fetchContextMaps(service, pageRows);
    return {
      payload: {
        items: pageRows.map((event) => mapEvent(event, maps)),
        nextCursor: nextRow ? encodeCursor({ createdAt: nextRow.created_at, id: nextRow.id }) : null,
      },
      status: 200,
    };
  } catch (contextError) {
    return {
      payload: {
        error: "learning_activity_context_failed",
        detail: contextError instanceof Error ? contextError.message : String(contextError),
      },
      status: 500,
    };
  }
}

export async function readPlatformLearningCards(
  auth: AuthenticatedSupabase,
  service: ServiceSupabase,
  filters: LearningReadFilters,
): Promise<LearningReadResult> {
  const limit = normalizeLimit(filters.limit);
  const internalLimit = Math.min(Math.max(limit * 20, 200), 1000);
  const { rows, error } = await fetchEvents(auth, service, filters, internalLimit);
  if (error) return error;

  const groups = new Map<
    string,
    {
      entryId: string;
      cardTypeId: string;
      firstMatchedAt: string;
      lastMatchedAt: string;
      matchedEventCount: number;
      sourceId: string | null;
      artifactId: string | null;
      locationId: string | null;
    }
  >();
  let overflowCursorRow: EventRow | null = null;
  let cursorBoundaryRow: EventRow | null = null;
  for (const event of rows) {
    const key = `${event.entry_id}:${event.card_type_id}`;
    const group = groups.get(key);
    if (!group) {
      if (groups.size >= limit) {
        overflowCursorRow = cursorBoundaryRow;
        break;
      }
      groups.set(key, {
        entryId: event.entry_id,
        cardTypeId: event.card_type_id,
        firstMatchedAt: event.created_at,
        lastMatchedAt: event.created_at,
        matchedEventCount: 1,
        sourceId: event.source_id,
        artifactId: event.artifact_id,
        locationId: event.location_id,
      });
      cursorBoundaryRow = event;
      continue;
    }
    group.matchedEventCount += 1;
    if (Date.parse(event.created_at) < Date.parse(group.firstMatchedAt)) {
      group.firstMatchedAt = event.created_at;
    }
    cursorBoundaryRow = event;
  }

  const pageGroups = Array.from(groups.values());
  const groupKeys = new Set(pageGroups.map((group) => `${group.entryId}:${group.cardTypeId}`));
  const stateEvents = rows.filter((event) => groupKeys.has(`${event.entry_id}:${event.card_type_id}`));

  try {
    const [maps, states] = await Promise.all([
      fetchContextMaps(service, stateEvents),
      fetchCardStates(auth, stateEvents),
    ]);
    const nextEvent =
      overflowCursorRow ??
      (rows.length === internalLimit ? rows[rows.length - 1] : null);
    return {
      payload: {
        items: pageGroups.map((group) => ({
          entryId: group.entryId,
          cardTypeId: group.cardTypeId,
          state: states.get(`${group.entryId}:${group.cardTypeId}`) ?? null,
          provenance: {
            firstMatchedAt: group.firstMatchedAt,
            lastMatchedAt: group.lastMatchedAt,
            matchedEventCount: group.matchedEventCount,
            source: mapSource(group.sourceId ? maps.sources.get(group.sourceId) : undefined),
            artifact: mapArtifact(
              group.artifactId ? maps.artifacts.get(group.artifactId) : undefined,
            ),
            location: mapLocation(
              group.locationId ? maps.locations.get(group.locationId) : undefined,
            ),
          },
        })),
        nextCursor: nextEvent
          ? encodeCursor({ createdAt: nextEvent.created_at, id: nextEvent.id })
          : null,
      },
      status: 200,
    };
  } catch (contextError) {
    return {
      payload: {
        error: "learning_cards_context_failed",
        detail: contextError instanceof Error ? contextError.message : String(contextError),
      },
      status: 500,
    };
  }
}
