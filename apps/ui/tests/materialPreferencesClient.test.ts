import { afterEach, beforeEach, expect, test, vi } from "vitest";
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession } } }));
import {
  fetchAccountMaterialPreferences,
  saveAccountMaterialPreferences,
} from "@/lib/training/material/client";
import { emptyMaterialPreferences } from "@/lib/training/material/model";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  getSession.mockResolvedValue({
    data: {
      session: { user: { id: "owner" }, access_token: "captured-token" },
    },
    error: null,
  });
});
afterEach(() => { vi.unstubAllGlobals(); });
test("account requests capture the expected user token and forward an abort signal", async () => {
  fetchMock.mockResolvedValue(Response.json(emptyMaterialPreferences()));
  expect(await fetchAccountMaterialPreferences("owner")).toEqual(
    emptyMaterialPreferences(),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/settings/material",
    expect.objectContaining({
      cache: "no-store",
      signal: expect.any(AbortSignal),
      headers: expect.objectContaining({
        authorization: "Bearer captured-token",
      }),
    }),
  );
});
test("switched/signed-out account cannot send a save under another user", async () => {
  await expect(
    saveAccountMaterialPreferences(
      "other",
      0,
      emptyMaterialPreferences().document,
    ),
  ).rejects.toThrow("Account unavailable");
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  await expect(fetchAccountMaterialPreferences("owner")).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
test("stale revisions return a conflict snapshot while failed/malformed responses throw", async () => {
  const snapshot = { ...emptyMaterialPreferences(), revision: 4 };
  fetchMock.mockResolvedValue(Response.json({ snapshot }, { status: 409 }));
  expect(
    await saveAccountMaterialPreferences("owner", 0, snapshot.document),
  ).toEqual({ kind: "conflict", snapshot });
  fetchMock.mockResolvedValue(
    Response.json({ error: "unavailable" }, { status: 503 }),
  );
  await expect(
    saveAccountMaterialPreferences("owner", 4, snapshot.document),
  ).rejects.toThrow("material_preferences_unavailable");
  fetchMock.mockResolvedValue(
    Response.json({ revision: "bad", document: snapshot.document }),
  );
  await expect(fetchAccountMaterialPreferences("owner")).rejects.toThrow(
    "invalid_material_preferences_response",
  );
});
