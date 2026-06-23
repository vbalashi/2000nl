import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
const getUser = vi.fn();
const from = vi.fn();
const createClient = vi.fn(() => ({
  auth: { getUser },
  rpc,
  from,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

type QueryCall = {
  method: string;
  args: unknown[];
};

const queryCalls: Record<string, QueryCall[]> = {};
let queryResponder: (table: string, calls: QueryCall[]) => { data?: unknown; error?: unknown } =
  () => ({ data: [], error: null });

function tableQuery(table: string) {
  const calls: QueryCall[] = [];
  queryCalls[table] = calls;
  const query: any = {
    select: vi.fn((...args: unknown[]) => {
      calls.push({ method: "select", args });
      return query;
    }),
    eq: vi.fn((...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return query;
    }),
    gte: vi.fn((...args: unknown[]) => {
      calls.push({ method: "gte", args });
      return query;
    }),
    lte: vi.fn((...args: unknown[]) => {
      calls.push({ method: "lte", args });
      return query;
    }),
    in: vi.fn((...args: unknown[]) => {
      calls.push({ method: "in", args });
      return query;
    }),
    or: vi.fn((...args: unknown[]) => {
      calls.push({ method: "or", args });
      return query;
    }),
    order: vi.fn((...args: unknown[]) => {
      calls.push({ method: "order", args });
      return query;
    }),
    limit: vi.fn((...args: unknown[]) => {
      calls.push({ method: "limit", args });
      return query;
    }),
    maybeSingle: vi.fn(async () => queryResponder(table, calls)),
    then: (resolve: (value: unknown) => void) => {
      resolve(queryResponder(table, calls));
    },
  };
  return query;
}

function getRequest(path: string, token = "token-1") {
  return new NextRequest(`http://localhost${path}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      origin: "https://client.example",
    },
  });
}

function mockAuthenticatedUser(userId = "user-1") {
  getUser.mockResolvedValueOnce({
    data: { user: { id: userId } },
    error: null,
  });
}

function sourceRow() {
  return {
    id: "source-1",
    kind: "youtube_video",
    provider: "youtube",
    external_id: "yt-abc",
    canonical_url: "https://www.youtube.com/watch?v=yt-abc",
    language_code: "nl",
    title: "should not leak",
    metadata: { diagnostics: "should not leak" },
  };
}

function privateSourceRow() {
  return {
    id: "source-private",
    kind: "web_page",
    provider: "web",
    external_id:
      "private:web_page:1111111111111111111111111111111111111111111111111111111111111111",
    canonical_url: "https://user:pass@example.com/private/path?token=secret#fragment",
    language_code: "nl",
    title: "Private Source Title",
    metadata: { diagnostics: ["private diagnostic"], rawContext: "private body" },
  };
}

function artifactRow() {
  return {
    id: "artifact-1",
    source_id: "source-1",
    artifact_kind: "phrase_set",
    producer: "audiofilms",
    snapshot_revision_id: "snap-1",
    text_source_id: "captions",
    text_source_revision_id: "cap-rev-1",
    text_content_fingerprint: "text-fp",
    timing_evidence_revision_id: "timing-rev-1",
    phrase_set_revision_id: "phrase-rev-1",
    builder_version: "builder-1",
    language_code: "nl",
    quality: "machine",
    metadata: { diagnostics: "should not leak" },
  };
}

function privateArtifactRow() {
  return {
    ...artifactRow(),
    id: "artifact-private",
    source_id: "source-private",
    artifact_kind: "private_snapshot",
    producer: "audiofilms",
    text_source_id: "private-text-source",
    phrase_set_revision_id: "private-phrase-rev",
    metadata: { diagnostics: ["private artifact diagnostic"] },
  };
}

function locationRow() {
  return {
    id: "location-1",
    source_id: "source-1",
    artifact_id: "artifact-1",
    locator_kind: "time_range",
    start_ms: 1200,
    end_ms: 2400,
    phrase_index: 7,
    text_hash: "hash-1",
    context_text: "should not leak",
  };
}

function privateLocationRow() {
  return {
    ...locationRow(),
    id: "location-private",
    source_id: "source-private",
    artifact_id: "artifact-private",
    locator_kind: "text_selection",
    text_hash: "private-context-hash",
    context_text: "private raw selected context",
    metadata: { diagnostics: ["private location diagnostic"] },
  };
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    user_id: "user-1",
    entry_id: "entry-1",
    card_type_id: "word-to-definition",
    action: "review-card",
    result: "success",
    client_event_id: "client-event-1",
    turn_id: "11111111-1111-4111-8111-111111111111",
    source_id: "source-1",
    location_id: "location-1",
    artifact_id: "artifact-1",
    clicked_form: "huis",
    context_text_hash: "context-hash",
    auth_kind: "connected_client",
    connected_client_id: "audiofilms-extension",
    source_context: { diagnostics: "should not leak" },
    created_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

function privateEventRow(overrides: Record<string, unknown> = {}) {
  return eventRow({
    id: "event-private",
    source_id: "source-private",
    location_id: "location-private",
    artifact_id: "artifact-private",
    clicked_form: "geheim",
    context_text_hash: "private-context-hash",
    source_context: {
      source: { title: "Private Source Title" },
      diagnostics: ["private event diagnostic"],
      context: { text: "private raw selected context" },
    },
    ...overrides,
  });
}

function expectNoPrivateSourceLeak(payload: unknown) {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toContain("source_context");
  expect(serialized).not.toContain("diagnostics");
  expect(serialized).not.toContain("Private Source Title");
  expect(serialized).not.toContain("private raw selected context");
  expect(serialized).not.toContain("private body");
  expect(serialized).not.toContain("user:pass");
  expect(serialized).not.toContain("token=secret");
  expect(serialized).not.toContain("#fragment");
}

describe("platform learning read routes", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "https://client.example";
    delete process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP;
    createClient.mockClear();
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
    from.mockImplementation((table: string) => tableQuery(table));
    for (const key of Object.keys(queryCalls)) delete queryCalls[key];
    queryResponder = () => ({ data: [], error: null });
  });

  test("activity requires platform:read for connected clients", async () => {
    process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP = "1";
    queryResponder = (table) => {
      if (table === "connected_client_sessions") {
        return {
          data: {
            id: "session-1",
            client_id: "client-1",
            user_id: "user-1",
            scopes: ["platform:write"],
            revoked_at: null,
            access_token_expires_at: "2099-01-01T00:00:00.000Z",
          },
          error: null,
        };
      }
      if (table === "connected_clients") {
        return { data: { client_id: "client-1", status: "active" }, error: null };
      }
      if (table === "connected_client_grants") {
        return { data: { scopes: ["platform:write"], revoked_at: null }, error: null };
      }
      return { data: [], error: null };
    };
    mockAuthenticatedUser();

    const { GET } = await import("@/app/api/platform/learning/activity/route");
    const response = await GET(getRequest("/api/platform/learning/activity"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "insufficient_scope",
      requiredScope: "platform:read",
    });
    expect(queryCalls.user_card_action_events).toBeUndefined();
  });

  test("activity filters by canonical YouTube source and redacts raw context", async () => {
    queryResponder = (table, calls) => {
      if (table === "learning_sources") {
        const hasSourceFilter = calls.some(
          (call) =>
            call.method === "eq" &&
            (call.args[0] === "kind" || call.args[0] === "external_id"),
        );
        return { data: hasSourceFilter ? [{ id: "source-1" }] : [sourceRow()], error: null };
      }
      if (table === "user_card_action_events") {
        return { data: [eventRow()], error: null };
      }
      if (table === "learning_source_locations") {
        return { data: [locationRow()], error: null };
      }
      if (table === "learning_source_artifacts") {
        return { data: [artifactRow()], error: null };
      }
      return { data: [], error: null };
    };
    mockAuthenticatedUser();

    const { GET } = await import("@/app/api/platform/learning/activity/route");
    const response = await GET(
      getRequest(
        "/api/platform/learning/activity?sourceKind=youtube_video&sourceExternalId=yt-abc&limit=1",
      ),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      id: "event-1",
      source: {
        id: "source-1",
        kind: "youtube_video",
        provider: "youtube",
        externalId: "yt-abc",
      },
      artifact: {
        id: "artifact-1",
        phraseSetRevisionId: "phrase-rev-1",
      },
      location: {
        id: "location-1",
        startMs: 1200,
        endMs: 2400,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("source_context");
    expect(JSON.stringify(payload)).not.toContain("diagnostics");
    expect(JSON.stringify(payload)).not.toContain("context_text");
    expect(queryCalls.user_card_action_events).toEqual(
      expect.arrayContaining([{ method: "in", args: ["source_id", ["source-1"]] }]),
    );
  });

  test("activity returns only sanitized summaries for private source rows", async () => {
    queryResponder = (table, calls) => {
      if (table === "learning_sources") {
        const isFilterLookup = calls.some(
          (call) => call.method === "select" && call.args[0] === "id",
        );
        return {
          data: isFilterLookup ? [{ id: "source-private" }] : [privateSourceRow()],
          error: null,
        };
      }
      if (table === "user_card_action_events") {
        return { data: [privateEventRow()], error: null };
      }
      if (table === "learning_source_locations") {
        return { data: [privateLocationRow()], error: null };
      }
      if (table === "learning_source_artifacts") {
        return { data: [privateArtifactRow()], error: null };
      }
      return { data: [], error: null };
    };
    mockAuthenticatedUser();

    const { GET } = await import("@/app/api/platform/learning/activity/route");
    const response = await GET(
      getRequest(
        "/api/platform/learning/activity?sourceKind=web_page&sourceProvider=web&limit=1",
      ),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      id: "event-private",
      source: {
        id: "source-private",
        kind: "web_page",
        provider: "web",
        canonicalUrl: null,
        languageCode: "nl",
      },
      selection: {
        clickedForm: "geheim",
        contextTextHash: "private-context-hash",
      },
    });
    expect(payload.items[0].source.externalId).toMatch(/^private:web_page:[a-f0-9]{64}$/);
    expectNoPrivateSourceLeak(payload);
  });

  test("cards collapse matching events and return current card state", async () => {
    queryResponder = (table) => {
      if (table === "user_card_action_events") {
        return {
          data: [
            eventRow({ id: "event-2", created_at: "2026-06-01T11:00:00.000Z" }),
            eventRow({ id: "event-1", created_at: "2026-06-01T10:00:00.000Z" }),
            eventRow({
              id: "event-3",
              entry_id: "entry-2",
              source_id: null,
              artifact_id: null,
              location_id: null,
              created_at: "2026-06-01T09:00:00.000Z",
            }),
          ],
          error: null,
        };
      }
      if (table === "learning_sources") return { data: [sourceRow()], error: null };
      if (table === "learning_source_locations") return { data: [locationRow()], error: null };
      if (table === "learning_source_artifacts") return { data: [artifactRow()], error: null };
      return { data: [], error: null };
    };
    rpc.mockImplementation((name: string) => {
      if (name === "get_user_card_states_for_entries") {
        return Promise.resolve({
          data: [
            {
              entry_id: "entry-1",
              card_type_id: "word-to-definition",
              click_count: 4,
              seen_count: 5,
              success_count: 3,
              last_seen_at: "2026-06-02T10:00:00.000Z",
              last_reviewed_at: "2026-06-02T10:00:00.000Z",
              next_review_at: "2026-06-03T10:00:00.000Z",
              hidden: false,
              frozen_until: null,
              in_learning: true,
              learning_due_at: "2026-06-03T10:00:00.000Z",
              fsrs_stability: 2.5,
              fsrs_difficulty: 6.1,
              fsrs_reps: 3,
              fsrs_lapses: 0,
              fsrs_last_grade: 3,
              fsrs_last_interval: 2,
              fsrs_params_version: "fsrs-6-default",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });
    mockAuthenticatedUser();

    const { GET } = await import("@/app/api/platform/learning/cards/route");
    const response = await GET(getRequest("/api/platform/learning/cards?limit=10"));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]).toMatchObject({
      entryId: "entry-1",
      cardTypeId: "word-to-definition",
      state: {
        clickCount: 4,
        inLearning: true,
      },
      provenance: {
        matchedEventCount: 2,
        firstMatchedAt: "2026-06-01T10:00:00.000Z",
        lastMatchedAt: "2026-06-01T11:00:00.000Z",
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_user_card_states_for_entries", {
      p_user_id: "user-1",
      p_entry_ids: ["entry-1", "entry-2"],
      p_card_type_ids: ["word-to-definition"],
    });
  });

  test("cards return only sanitized provenance summaries for private source rows", async () => {
    queryResponder = (table) => {
      if (table === "user_card_action_events") {
        return { data: [privateEventRow()], error: null };
      }
      if (table === "learning_sources") return { data: [privateSourceRow()], error: null };
      if (table === "learning_source_locations") {
        return { data: [privateLocationRow()], error: null };
      }
      if (table === "learning_source_artifacts") {
        return { data: [privateArtifactRow()], error: null };
      }
      return { data: [], error: null };
    };
    rpc.mockResolvedValue({ data: [], error: null });
    mockAuthenticatedUser();

    const { GET } = await import("@/app/api/platform/learning/cards/route");
    const response = await GET(getRequest("/api/platform/learning/cards?sourceKind=web_page"));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].provenance.source).toMatchObject({
      id: "source-private",
      kind: "web_page",
      provider: "web",
      canonicalUrl: null,
      languageCode: "nl",
    });
    expect(payload.items[0].provenance.source.externalId).toMatch(
      /^private:web_page:[a-f0-9]{64}$/,
    );
    expectNoPrivateSourceLeak(payload);
  });

  test("cards return a cursor when more matched groups exist in the event window", async () => {
    queryResponder = (table) => {
      if (table === "user_card_action_events") {
        return {
          data: [
            eventRow({ id: "event-2", created_at: "2026-06-01T11:00:00.000Z" }),
            eventRow({
              id: "event-3",
              entry_id: "entry-2",
              source_id: null,
              artifact_id: null,
              location_id: null,
              created_at: "2026-06-01T09:00:00.000Z",
            }),
          ],
          error: null,
        };
      }
      if (table === "learning_sources") return { data: [sourceRow()], error: null };
      if (table === "learning_source_locations") return { data: [locationRow()], error: null };
      if (table === "learning_source_artifacts") return { data: [artifactRow()], error: null };
      return { data: [], error: null };
    };
    rpc.mockResolvedValue({ data: [], error: null });
    mockAuthenticatedUser();

    const { GET } = await import("@/app/api/platform/learning/cards/route");
    const response = await GET(getRequest("/api/platform/learning/cards?limit=1"));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].entryId).toBe("entry-1");
    expect(typeof payload.nextCursor).toBe("string");
  });

  test("v1 activity route reuses the same contract", async () => {
    queryResponder = (table) => {
      if (table === "user_card_action_events") {
        return { data: [eventRow()], error: null };
      }
      if (table === "learning_sources") return { data: [sourceRow()], error: null };
      if (table === "learning_source_locations") return { data: [locationRow()], error: null };
      if (table === "learning_source_artifacts") return { data: [artifactRow()], error: null };
      return { data: [], error: null };
    };
    mockAuthenticatedUser();

    const { GET } = await import("@/app/api/platform/v1/learning/activity/route");
    const response = await GET(getRequest("/api/platform/v1/learning/activity"));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items[0].id).toBe("event-1");
  });
});
