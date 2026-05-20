import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
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

describe("/api/health", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.SUPABASE_SECRET_KEY = "service-key";
    rpc.mockReset();
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
    createClient.mockReturnValueOnce({ rpc });
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
  });
});
