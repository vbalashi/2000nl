import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
const { rpc, getAuth, requireScope, stillReadable } = vi.hoisted(() => ({ rpc: vi.fn(), getAuth: vi.fn(), requireScope: vi.fn(), stillReadable: vi.fn() }));
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: getAuth,
  requirePlatformScope: requireScope,
  jsonNoStore: (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } }),
  withPlatformCors: (_request: unknown, response: Response) => response,
  platformCorsPreflight: () => new Response(null, { status: 204 }),
}));
vi.mock("@/lib/platform/dictionaryEntryReadAuthority", () => ({ dictionaryEntrySourceStillReadable: stillReadable }));
import { handlePlatformCatalogRead } from "@/lib/platform/platformCatalogReadService";
const id = "11111111-1111-4111-8111-111111111111", dict = "22222222-2222-4222-8222-222222222222";
const details = { id, name: "Example collection", description: null, source: null, revision: "1", isOwner: true };
const entry = { id, headword: "huis", dictionary_id: dict, language_code: "nl", raw: { meanings: [{ definition: "Een gebouw om in te wonen." }], privateProviderField: "must-not-leak", _metadata: { providerSecret: "must-not-leak" } } };
const request = (suffix = "") => new NextRequest(`http://localhost/api/platform/v1/collections${suffix}`);
const result = (data: unknown, error: unknown = null) => ({ abortSignal: () => Promise.resolve({ data, error }) });
describe("connected-client read-only catalogs", () => {
  beforeEach(() => { rpc.mockReset(); getAuth.mockReset(); requireScope.mockReset(); stillReadable.mockReset(); getAuth.mockResolvedValue({ user: { id: "authenticated-user" }, principal: { authKind: "connected_client", scopes: ["platform:read"] }, supabase: { rpc } }); requireScope.mockReturnValue(null); stillReadable.mockResolvedValue(true); });
  test("authentication and scope failures never read data", async () => {
    getAuth.mockResolvedValueOnce(Response.json({ error: "unauthorized" }, { status: 401 }));
    expect((await handlePlatformCatalogRead(request(), "collections")).status).toBe(401);
    requireScope.mockReturnValueOnce(Response.json({ error: "scope_required" }, { status: 403 }));
    expect((await handlePlatformCatalogRead(request(), "collections")).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  test("dictionary sources use the server principal and return a bounded public projection", async () => {
    rpc.mockReturnValueOnce(result([{ id: dict, language_code: "nl", name: "Example", kind: "user", visibility: "private", entry_count: 3, owner_user_id: "private-owner-field" }]));
    const response = await handlePlatformCatalogRead(new NextRequest("http://localhost/api/platform/v1/dictionaries?languageCode=nl"), "dictionaries");
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(rpc).toHaveBeenCalledWith("get_available_dictionary_sources", { p_user_id: "authenticated-user", p_language_code: "nl" });
    expect(await response.json()).toEqual({ dictionaries: [{ id: dict, languageCode: "nl", name: "Example", kind: "user", visibility: "private", entryCount: 3 }] });
  });
  test.each(["?ownerUserId=other", "?limit=500", "?cursor=not-json", "?query=a&query=b", "?languageCode=x"])("rejects invalid query %s before any RPC", async suffix => {
    expect((await handlePlatformCatalogRead(request(suffix), "collections")).status).toBe(400); expect(rpc).not.toHaveBeenCalled();
  });
  test("owned catalog preserves an empty successful result and forces ownership", async () => {
    rpc.mockReturnValueOnce(result({ revision: 2, collections: [], nextCursor: null }));
    const response = await handlePlatformCatalogRead(request(), "collections");
    expect(await response.json()).toEqual({ revision: 2, collections: [], nextCursor: null });
    expect(rpc.mock.calls[0][1].p_ownership).toBe("owned");
  });
  test("contract/backend errors do not turn into an empty catalog or leak DB errors", async () => {
    rpc.mockReturnValueOnce(result(null, { message: "secret DB diagnostic" }));
    const response = await handlePlatformCatalogRead(request(), "collections");
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret");
    rpc.mockReturnValueOnce(result({ collections: [] }));
    expect((await handlePlatformCatalogRead(request(), "collections")).status).toBe(502);
  });
  test("received collections are unavailable before a content read", async () => {
    rpc.mockReturnValueOnce(result({ ...details, isOwner: false }));
    expect((await handlePlatformCatalogRead(request(), "entries", id)).status).toBe(404);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  test("collection content keeps exact entry/dictionary identity without raw provider fields", async () => {
    rpc.mockReturnValueOnce(result(details)).mockReturnValueOnce(result({ items: [entry], total: 1, is_locked: false, max_allowed: null })).mockReturnValueOnce(result(details));
    const response = await handlePlatformCatalogRead(request("?pageSize=25"), "entries", id);
    expect(response.status).toBe(200); const body = await response.json();
    expect(body.items[0]).toMatchObject({ id, dictionaryId: dict, content: { meanings: [{ definition: "Een gebouw om in te wonen." }] } });
    expect(JSON.stringify(body)).not.toContain("must-not-leak"); expect(body.hasMore).toBe(false);
  });
  test("revocation during preparation fails closed", async () => {
    rpc.mockReturnValueOnce(result(details)).mockReturnValueOnce(result({ items: [], total: 0, is_locked: false, max_allowed: null })).mockReturnValueOnce(result(null, { code: "42501" }));
    expect((await handlePlatformCatalogRead(request(), "entries", id)).status).toBe(409);
  });
  test("an exact entry read revalidates identity and never falls back to spelling lookup", async () => {
    rpc.mockReturnValueOnce(result(entry));
    const response = await handlePlatformCatalogRead(request(), "entry", id);
    expect(response.status).toBe(200); expect(stillReadable).toHaveBeenCalled();
    expect((await response.json()).item.entry.id).toBe(id);
    expect(rpc.mock.calls[0][0]).toBe("fetch_dictionary_entry_by_id_gated");
  });
  test("changed exact entries and malformed IDs are not returned", async () => {
    rpc.mockReturnValueOnce(result(entry)); stillReadable.mockResolvedValueOnce(false);
    expect((await handlePlatformCatalogRead(request(), "entry", id)).status).toBe(409);
    expect((await handlePlatformCatalogRead(request(), "entry", "not-an-id")).status).toBe(400);
  });
});
