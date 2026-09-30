import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const { auth, rpc } = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/platform/serverSupabase", () => ({ getAuthenticatedSupabase: auth, jsonNoStore: (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } }) }));
import { GET } from "@/app/api/training/material-progress/route";

const DICT = "11111111-1111-4111-8111-111111111111";
const LIST = "22222222-2222-4222-8222-222222222222";
const get = (suffix = "?language=nl") => new NextRequest(`http://localhost/api/training/material-progress${suffix}`);
const page = () => ({
  languageCode: "nl",
  materials: [
    { kind: "all", total: 40, started: 5, due: 3 },
    { kind: "dictionary", id: DICT, name: "Van Dale", personal: false, total: 30, started: 4, due: 2 },
    { kind: "collection", id: LIST, listType: "user", name: "Mine", personal: true, total: 6, started: 1, due: 1 },
  ],
});
const parsed = () => ({
  languageCode: "nl",
  materials: [
    { kind: "all", id: null, listType: null, name: null, personal: false, total: 40, started: 5, due: 3 },
    { kind: "dictionary", id: DICT, listType: null, name: "Van Dale", personal: false, total: 30, started: 4, due: 2 },
    { kind: "collection", id: LIST, listType: "user", name: "Mine", personal: true, total: 6, started: 1, due: 1 },
  ],
});
beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue({ supabase: { rpc }, principal: { authKind: "first_party" } }); rpc.mockResolvedValue({ data: page(), error: null }); });

test("authenticates first-party learners before any read", async () => {
  auth.mockResolvedValue(Response.json({ error: "unauthorized" }, { status: 401 }));
  expect((await GET(get())).status).toBe(401);
  auth.mockResolvedValue({ principal: { authKind: "connected_client" } });
  expect((await GET(get())).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});

test("reads one language and returns only validated material fields", async () => {
  const data = page();
  rpc.mockResolvedValue({ data: { ...data, internal: "hidden", materials: data.materials.map(m => ({ ...m, ownerId: "x" })) }, error: null });
  const response = await GET(get());
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual(parsed());
  expect(rpc).toHaveBeenCalledWith("get_training_material_progress_v1", { p_language_code: "nl" });
});

test("rejects missing/invalid language and unsupported identity hints", async () => {
  for (const suffix of ["", "?language=Dutch", "?language=nl&userId=victim", "?language=nl&dictionaryId=" + DICT])
    expect((await GET(get(suffix))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

test("fails closed on errors, foreign languages and malformed rows", async () => {
  const good = page();
  const withRow = (index: number, patch: Record<string, unknown>) => ({ ...good, materials: good.materials.map((m, i) => i === index ? { ...m, ...patch } : m) });
  for (const data of [{ error: "unauthorized" }, { ...good, languageCode: "de" }, { ...good, materials: [] }, { ...good, materials: good.materials.slice(1) },
    withRow(0, { started: 41 }), withRow(1, { due: -1 }), withRow(1, { id: "not-a-uuid" }), withRow(2, { listType: "shared" }), withRow(2, { name: "" })]) {
    rpc.mockResolvedValue({ data, error: null });
    const response = await GET(get());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "material_progress_unavailable" });
  }
  rpc.mockResolvedValue({ data: null, error: { message: "private" } });
  expect((await GET(get())).status).toBe(503);
  rpc.mockRejectedValue(new Error("network"));
  expect((await GET(get())).status).toBe(503);
});
