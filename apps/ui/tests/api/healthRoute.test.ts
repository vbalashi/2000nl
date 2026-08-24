import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
const from = vi.fn();
const createClient = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

vi.mock("@/lib/appVersion", () => ({
  appVersionInfo: vi.fn(() => ({
    version: "0.0.0-test",
    commit: "test-commit",
  })),
}));

const request = (query = "") =>
  new NextRequest(`http://localhost/api/health${query}`);

const searchIndexFromMock = (options?: {
  documentRowCount?: number;
  fieldRowCount?: number;
  activeExtractionVersion?: number | null;
  staleDocumentCount?: number;
}) => {
  const {
    documentRowCount = 10,
    fieldRowCount = 40,
    activeExtractionVersion = 2,
    staleDocumentCount = 0,
  } = options ?? {};

  return vi.fn((table: string) => {
    let staleCountQuery = false;
    const query: any = {
      select: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      lt: vi.fn(() => {
        staleCountQuery = true;
        return query;
      }),
      maybeSingle: vi.fn(async () => ({
        data:
          activeExtractionVersion === null
            ? null
            : { extraction_version: activeExtractionVersion },
        error: null,
      })),
      then: (resolve: any, reject: any) => {
        const count = staleCountQuery
          ? staleDocumentCount
          : table === "dictionary_search_documents"
            ? documentRowCount
            : fieldRowCount;
        return Promise.resolve({ count, error: null }).then(resolve, reject);
      },
    };
    return query;
  });
};

const contractStateFromMock = (options?: {
  contractId?: string;
  migrationId?: number;
  error?: string;
}) =>
  vi.fn(() => {
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: options?.error
          ? null
          : {
              contract_id: options?.contractId ?? "2000nl-db-125",
              migration_id: options?.migrationId ?? 125,
            },
        error: options?.error ? { message: options.error } : null,
      })),
    };
    return query;
  });

describe("/api/health", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.SUPABASE_SECRET_KEY = "service-key";
    rpc.mockReset();
    from.mockReset();
    createClient.mockReset();
  });

  test("returns shallow health without touching Supabase", async () => {
    const { GET } = await import("@/app/api/health/route");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks).toBeUndefined();
    expect(body.rollout).toEqual({
      profile: "legacy",
      approvedPilot: false,
      flags: expect.any(Object),
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  test("reports the active approved pilot profile and flags", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ROLLOUT_PROFILE", "pilot");
    vi.stubEnv("PLATFORM_V2_LOOKUP_ENABLED", "true");
    vi.stubEnv("PLATFORM_V2_ACTIONS_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_PLATFORM_V2_TRAINING_UI", "true");
    vi.stubEnv("NEXT_PUBLIC_PLATFORM_V2_LIBRARY_UI", "true");
    vi.stubEnv("NEXT_PUBLIC_NAVIGATION_SHELL_V1", "true");
    vi.stubEnv("NEXT_PUBLIC_SETTINGS_STATISTICS_DESTINATIONS_V1", "true");
    vi.stubEnv("NEXT_PUBLIC_TRAINING_TODAY_SETUP_V1", "true");

    const { GET } = await import("@/app/api/health/route");
    const response = await GET(request());
    const body = await response.json();

    expect(body.rollout).toEqual({
      profile: "pilot",
      approvedPilot: true,
      flags: {
        platformV2Lookup: true,
        platformV2Actions: true,
        platformV2TrainingUi: true,
        platformV2LibraryUi: true,
        navigationShellV1: true,
        settingsStatisticsDestinationsV1: true,
        trainingTodaySetupV1: true,
      },
    });
  });

  test("warns when the platform RPC contract is missing", async () => {
    createClient
      .mockReturnValueOnce({ rpc })
      .mockReturnValueOnce({ from: searchIndexFromMock() })
      .mockReturnValueOnce({ from: contractStateFromMock() });
    rpc.mockResolvedValue({ data: { items: [], total: 0 }, error: null });
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        message:
          "Could not find the function public.fetch_dictionary_entry_by_id_gated(p_entry_id) in the schema cache",
      },
    });

    const { GET } = await import("@/app/api/health/route");

    const response = await GET(request("?deep=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("warning");
    expect(body.database.target).toBe("local");
    expect(body.checks.platformRpcContract).toEqual({
      status: "warning",
      message: expect.stringContaining("fetch_dictionary_entry_by_id_gated"),
    });
    expect(body.checks.dictionarySearchIndex).toEqual({
      status: "ok",
      details: expect.objectContaining({
        lookupAvailable: true,
        groupedSearchIndexReady: true,
        documentRowCount: 10,
        fieldRowCount: 40,
        activeExtractionVersion: 2,
        staleDocumentCount: 0,
        pendingBackfill: false,
      }),
    });
    expect(body.checks.databaseContract).toEqual({
      status: "ok",
      details: {
        expected: "2000nl-db-125",
        expectedMigration: 125,
        actual: "2000nl-db-125",
        actualMigration: 125,
        compatible: true,
      },
    });
  });

  test("deep health warns when grouped dictionary search index is not ready", async () => {
    createClient
      .mockReturnValueOnce({ rpc })
      .mockReturnValueOnce({
        from: searchIndexFromMock({
          documentRowCount: 0,
          fieldRowCount: 0,
          activeExtractionVersion: null,
        }),
      })
      .mockReturnValueOnce({ from: contractStateFromMock() });
    rpc.mockResolvedValue({ data: { items: [], total: 0 }, error: null });

    const { GET } = await import("@/app/api/health/route");

    const response = await GET(request("?deep=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("warning");
    expect(body.checks.dictionarySearchIndex).toEqual({
      status: "warning",
      message: "Grouped dictionary search index is not ready.",
      details: expect.objectContaining({
        lookupAvailable: true,
        groupedSearchIndexReady: false,
        documentRowCount: 0,
        fieldRowCount: 0,
        activeExtractionVersion: null,
        pendingBackfill: true,
      }),
    });
  });

  test("deep health exposes only a bounded incompatible DB contract signal", async () => {
    createClient
      .mockReturnValueOnce({ rpc })
      .mockReturnValueOnce({ from: searchIndexFromMock() })
      .mockReturnValueOnce({
        from: contractStateFromMock({
          contractId: "2000nl-db-124",
          migrationId: 124,
        }),
      });
    rpc.mockResolvedValue({ data: { items: [], total: 0 }, error: null });

    const { GET } = await import("@/app/api/health/route");
    const response = await GET(request("?deep=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("warning");
    expect(body.checks.databaseContract).toEqual({
      status: "warning",
      message: "Application and database contracts are incompatible.",
      details: {
        expected: "2000nl-db-125",
        expectedMigration: 125,
        actual: "2000nl-db-124",
        actualMigration: 124,
        compatible: false,
      },
    });
    expect(JSON.stringify(body.checks.databaseContract)).not.toContain("function");
    expect(JSON.stringify(body.checks.databaseContract)).not.toContain("schema");
  });
});
