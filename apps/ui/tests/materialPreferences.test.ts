import { expect, test, vi } from "vitest";
import {
  type MaterialPreferences,
  emptyMaterialPreferences,
  parseMaterialPreferences,
  parseMaterialPreferencesSnapshot,
} from "@/lib/training/material/model";
import { createMaterialPreferencesRepository } from "@/lib/training/material/repository";
import type { SupabaseClient } from "@supabase/supabase-js";
const base: MaterialPreferences = {
  schemaVersion: 1,
  learningLanguages: [
    { code: "nl", paused: false },
    { code: "en", paused: true },
  ],
  disabledDictionaryIds: ["11111111-1111-4111-8111-111111111111"],
};
test("material settings keep ordered languages, pause and dictionary identity without content or ACLs", () => {
  expect(parseMaterialPreferences(base)).toEqual(base);
  expect(parseMaterialPreferences(emptyMaterialPreferences().document)).toEqual(
    emptyMaterialPreferences().document,
  );
  expect(
    parseMaterialPreferencesSnapshot({ revision: 2, document: base }),
  ).toEqual({ revision: 2, document: base });
});
test.each([
  null,
  {},
  { ...base, learningLanguages: [{ code: "nl", paused: true }] },
  {
    ...base,
    learningLanguages: [
      { code: "nl", paused: false },
      { code: "nl", paused: true },
    ],
  },
  { ...base, learningLanguages: [{ code: "NL", paused: false }] },
  { ...base, learningLanguages: [{ code: "nl", paused: "false" }] },
  { ...base, disabledDictionaryIds: ["bad"] },
  {
    ...base,
    disabledDictionaryIds: [
      base.disabledDictionaryIds[0],
      base.disabledDictionaryIds[0],
    ],
  },
  { ...base, acl: "write" },
  {
    ...base,
    learningLanguages: [{ code: "nl", paused: false, label: "untrusted" }],
  },
  {
    ...base,
    learningLanguages: Array.from({ length: 101 }, () => ({
      code: "nl",
      paused: false,
    })),
  },
])("reject malformed, duplicate or entirely paused documents: %j", (value) =>
  expect(parseMaterialPreferences(value)).toBeNull(),
);
test("stale device saves expose authoritative conflict, never overwrite it or save into another account", async () => {
  const response = {
    data: { conflict: true, revision: 4, document: base },
    error: null,
  };
  const rpc = vi
    .fn()
    .mockReturnValue({ abortSignal: vi.fn().mockResolvedValue(response) });
  const repository = createMaterialPreferencesRepository({
    rpc,
  } as unknown as SupabaseClient);
  expect(await repository.save(2, base)).toEqual({
    kind: "conflict",
    snapshot: { revision: 4, document: base },
  });
  expect(rpc).toHaveBeenCalledWith("save_account_material_preferences_v1", {
    p_expected_revision: 2,
    p_document: base,
  });
  // No user ID parameter: principal comes from auth.uid(), not the browser.
  expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_user_id");
});
test("load distinguishes a missing row, corrupt response and database error", async () => {
  const maybeSingle = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({
      data: { material_preferences: base, material_preferences_revision: 3 },
      error: null,
    })
    .mockResolvedValueOnce({
      data: { material_preferences: {}, material_preferences_revision: 0 },
      error: null,
    })
    .mockResolvedValueOnce({ data: null, error: { message: "offline" } });
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(),
    maybeSingle,
  };
  const client = { from: vi.fn().mockReturnValue(query) };
  const repository = createMaterialPreferencesRepository(
    client as unknown as SupabaseClient,
  );
  expect(await repository.load("account")).toEqual(emptyMaterialPreferences());
  expect(await repository.load("account")).toEqual({
    revision: 3,
    document: base,
  });
  await expect(repository.load("account")).rejects.toThrow(
    "invalid_material_preferences_response",
  );
  await expect(repository.load("account")).rejects.toThrow(
    "material_preferences_unavailable",
  );
  expect(query.eq).toHaveBeenCalledWith("user_id", "account");
});
test("failed saves and invalid input never report a successful preference change", async () => {
  const rpc = vi.fn().mockReturnValue({
    abortSignal: vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "offline" } }),
  });
  const repository = createMaterialPreferencesRepository({
    rpc,
  } as unknown as SupabaseClient);
  await expect(repository.save(0, base)).rejects.toThrow(
    "material_preferences_unavailable",
  );
  await expect(repository.save(-1, base)).rejects.toThrow(
    "invalid_material_preferences",
  );
  expect(rpc).toHaveBeenCalledOnce();
});
