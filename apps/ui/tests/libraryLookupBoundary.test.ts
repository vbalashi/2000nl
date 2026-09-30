import { expect, test, vi } from "vitest";
import { performPlatformV2Lookup } from "@/lib/platform/platformV2LookupService";
import type {
  AuthenticatedSupabase,
  ServiceSupabase,
} from "@/lib/platform/serverSupabase";
const request = {
  query: "goed",
  cardTypeId: "word-to-definition" as const,
  intent: "dictionary-lookup" as const,
  contentLanguageCode: "nl",
};
const context = (kind = "first_party") => ({
  kind: "authenticated" as const,
  auth: {
    user: { id: "actual-owner" },
    principal: { authKind: kind },
  } as AuthenticatedSupabase,
  service: {
    supabase: {
      rpc: vi
        .fn()
        .mockResolvedValue({
          data: {
            query: "goed",
            items: [],
            page: { selectedTierComplete: true, nextGroupCursor: null },
          },
          error: null,
        }),
    },
  } as unknown as ServiceSupabase,
});
test("scoped search calls only the server adapter with the authenticated owner and explicit IDs", async () => {
  const c = context();
  expect(
    (await performPlatformV2Lookup(c, request, { dictionaryIds: [] })).status,
  ).toBe(200);
  expect(c.service.supabase.rpc).toHaveBeenCalledWith(
    "lookup_platform_v2_library_entries",
    {
      p_user_id: "actual-owner",
      p_query: "goed",
      p_language_code: "nl",
      p_cursor: null,
      p_group_limit: 10,
      p_group_entry_bound: 50,
      p_dictionary_ids: [],
    },
  );
});
test("ordinary lookup retains its unchanged RPC and no material preference scope", async () => {
  const c = context();
  await performPlatformV2Lookup(c, request);
  expect(c.service.supabase.rpc).toHaveBeenCalledWith(
    "lookup_platform_v2_entries",
    expect.objectContaining({ p_user_id: "actual-owner", p_catalog: false }),
  );
  expect(c.service.supabase.rpc).toHaveBeenCalledOnce();
});
test("connected client and exact-entry calls cannot enter the scoped Library boundary", async () => {
  const c = context("connected_client");
  expect(
    (await performPlatformV2Lookup(c, request, { dictionaryIds: null })).status,
  ).toBe(403);
  expect(c.service.supabase.rpc).not.toHaveBeenCalled();
  const exact = context();
  expect(
    (
      await performPlatformV2Lookup(
        exact,
        {
          entryId: "8746de41-779a-444d-be38-287efc416d8f",
          cardTypeId: "word-to-definition",
          intent: "dictionary-lookup",
        },
        { dictionaryIds: null },
      )
    ).status,
  ).toBe(403);
  expect(exact.service.supabase.rpc).not.toHaveBeenCalled();
});
