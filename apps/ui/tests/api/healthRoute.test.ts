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
    expect(createClient).not.toHaveBeenCalled();
  });

  test("warns when the platform RPC contract is missing", async () => {
    createClient
      .mockReturnValueOnce({ rpc })
      .mockReturnValueOnce({ from: searchIndexFromMock() });
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
      });
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
});
