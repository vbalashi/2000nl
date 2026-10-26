import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { authenticate, scope, rpc, ordinary, archived } = vi.hoisted(() => ({
  authenticate: vi.fn(), scope: vi.fn(), rpc: vi.fn(), ordinary: vi.fn(), archived: vi.fn(),
}));
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: authenticate,
  requirePlatformScope: scope,
  jsonNoStore: (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } }),
  withPlatformCors: (_request: unknown, response: Response) => response,
  platformCorsPreflight: () => new Response(null, { status: 204 }),
}));
vi.mock("@/lib/translation/dictionaryMeaningTranslationRequestService", () => ({ requestDictionaryMeaningTranslation: ordinary }));
vi.mock("@/lib/translation/currentTrainingCardTranslation", () => ({ requestCurrentTrainingCardTranslation: archived }));
vi.mock("@/lib/translation/translationProvider", () => ({ createTranslator: vi.fn(), loadTranslationConfigFromEnv: vi.fn() }));
import { POST } from "@/app/api/platform/translation/route";

const entryId = "75400000-0000-4000-8000-000000000001";
const currentCard = { sessionId: "75400000-0000-4000-8000-000000000002", permitId: "75400000-0000-4000-8000-000000000003" };
const entry = { id: entryId, headword: "huis", raw: { meanings: [{ definition: "woning" }] }, archived_at: null };
const authorized = () => ({ data: { items: [entry] }, error: null });
const denied = () => ({ data: null, error: { message: "current_training_permit_invalid" } });
const translated = { payload: { status: "ready", overlay: { meanings: [{ definition: "house" }] } }, httpStatus: 200, cacheStatus: "MISS" };
const owner = { user: { id: "actual-owner" }, principal: { authKind: "first_party" }, supabase: { rpc } };
const request = () => new NextRequest("http://localhost/api/platform/translation", {
  method: "POST", body: JSON.stringify({ entryId, targetLang: "en", currentCard }),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED", "true");
  authenticate.mockResolvedValue(owner);
  scope.mockReturnValue(null);
  rpc.mockResolvedValue(authorized());
  ordinary.mockResolvedValue(translated);
  archived.mockResolvedValue(translated);
});
afterEach(() => { vi.unstubAllEnvs(); });

test("active entry translation cannot return an overlay after its current permit is revoked while awaiting translation", async () => {
  let release!: (value: typeof translated) => void;
  ordinary.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  rpc.mockResolvedValueOnce(authorized()).mockResolvedValueOnce(denied());
  const pending = POST(request());
  await vi.waitFor(() => expect(ordinary).toHaveBeenCalledOnce());
  expect(rpc).toHaveBeenCalledTimes(1);
  release(translated);
  const response = await pending;
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "current_training_permit_invalid" });
  expect(response.headers.get("x-platform-cache")).toBeNull();
  expect(rpc).toHaveBeenCalledTimes(2);
  for (const call of rpc.mock.calls) expect(call).toEqual(["read_current_training_entry_v1", {
    p_user_id: owner.user.id, p_session_id: currentCard.sessionId, p_permit_id: currentCard.permitId,
  }]);
  expect(archived).not.toHaveBeenCalled();
});

test("active entry translation returns the normal response only after a successful final permit check", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ entryId, targetLang: "en", ...translated.payload });
  expect(response.headers.get("x-platform-cache")).toBe("MISS");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(scope).toHaveBeenCalledWith(owner, "platform:write");
  expect(ordinary).toHaveBeenCalledWith(expect.objectContaining({ wordEntryId: entryId, word: entry, dbLang: "en" }));
});

test.each(["flag-off", "connected-client"])("%s cannot use current-card translation", async kind => {
  if (kind === "flag-off") vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED", "false");
  else authenticate.mockResolvedValue({ ...owner, principal: { authKind: "connected_client" } });
  const response = await POST(request());
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "current_training_card_forbidden" });
  expect(rpc).not.toHaveBeenCalled();
  expect(ordinary).not.toHaveBeenCalled();
  expect(archived).not.toHaveBeenCalled();
});

test.each([true, false])("archived inline translation has an authorization callback and final guard (permit valid: %s)", async valid => {
  rpc.mockResolvedValueOnce({ data: { items: [{ ...entry, archived_at: "2026-10-25T12:00:00Z" }] }, error: null });
  archived.mockImplementation(async (_input, stillAuthorized: () => Promise<boolean>) => {
    expect(await stillAuthorized()).toBe(true);
    // The inline coordinator's own check can pass, then revocation can happen before route response.
    rpc.mockResolvedValue(valid ? authorized() : denied());
    return translated;
  });
  const response = await POST(request());
  expect(ordinary).not.toHaveBeenCalled();
  expect(archived).toHaveBeenCalledWith(expect.objectContaining({ wordEntryId: entryId }), expect.any(Function));
  expect(rpc).toHaveBeenCalledTimes(3);
  expect(response.status).toBe(valid ? 200 : 403);
  expect(await response.json()).toEqual(valid ? { entryId, targetLang: "en", ...translated.payload } : { error: "current_training_permit_invalid" });
});
