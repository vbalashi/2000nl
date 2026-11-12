import { describe, expect, test, vi } from "vitest";
import { performPlatformV2Lookup } from "@/lib/platform/platformV2LookupService";

describe.each(["current", "library"] as const)("%s reader report identity", (reader) => {
 test.each((["missing", "null", "present"] as const).flatMap(revisionState => (["ready", "error", "throws"] as const).map(articleState => ({revisionState, articleState}))))(
  "preserves report identity: $revisionState / $articleState",
  async ({revisionState, articleState}) => {
    vi.stubEnv("PLATFORM_V2_ACTIONS_ENABLED", "1");
    const entryId = "75400000-0000-4000-8000-000000000001";
    const currentCard = {
      sessionId: "75400000-0000-4000-8000-000000000002",
      permitId: "75400000-0000-4000-8000-000000000003",
    };
    const identity = {
      entryId,
      headwordGroupId: "group-house",
      meaningOrdinal: 1,
      contentNodeBindings: [
        {
          contentNodeId: "definition",
          sourcePath: "raw.meanings[0].definition",
          kind: "definition",
          parentContentNodeId: null,
          sourceTextFingerprint: "fingerprint",
        },
      ],
    };
    const entry = {
      id: entryId,
      dictionary_id: "dictionary",
      language_code: "nl",
      headword: "huis",
      meaning_id: 1,
      part_of_speech: "zn",
      raw: { meanings: [{ definition: "woning" }] },
      dictionary: {
        id: "dictionary",
        language_code: "nl",
        slug: "demo",
        name: "Demo",
        kind: "curated",
        visibility: "system",
        schema_key: "nl-example-v2",
        schema_version: 1,
      },
      platform_v2_identity: {
        ...identity,
        ...(revisionState === "missing"
          ? {}
          : {
              reportContentRevision:
                revisionState === "null" ? null : "a".repeat(64),
            }),
      },
    };
    const rpc = vi.fn(async (name: string) => {
      if (name === "read_current_training_entry_v1" || name === "read_platform_v2_library_group")
        return {
          data: {
            items: [entry],
            currentTarget: {
              ...currentCard,
              entryId,
              cardTypeId: "word-to-definition",
            },
            page: {},
          },
          error: null,
        };
      if (name === "read_platform_v2_training_group") {
        if (articleState === "throws") throw new Error("article transport failed");
        if (articleState === "error") return {data:null,error:{message:"unavailable"}};
        return {data:{items:[entry,{...entry,id:"sibling-entry"}]},error:null};
      }
      if (name === "read_platform_v2_presentation_identity")
        return {
          data: {
            entries: [{ ...identity, reportContentRevision: "a".repeat(64) }],
          },
          error: null,
        };
      return { data: [], error: null };
    });
    const query: any = {
      select: () => query,
      eq: () => query,
      in: () => query,
      then: (resolve: any) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    const supabase = { rpc, from: () => query };
    try {
      const result = await performPlatformV2Lookup(
        {
          kind: "authenticated",
          auth: {
            user: { id: "owner" },
            principal: {
              authKind: "first_party",
              scopes: new Set(["platform:write"]),
            },
            supabase,
          } as any,
          service: { supabase } as any,
        },
        {
          entryId,
          contentLanguageCode: "nl",
          translationTargetLanguageCode: "ru",
          cardTypeId: "word-to-definition",
          intent: reader === "current" ? "training-review" : "dictionary-lookup",
        },
        undefined,
        reader === "current" ? currentCard : undefined,
      );
      expect(result.status, JSON.stringify(result.payload)).toBe(200);
      const payload = result.payload as any;
      expect(payload.groups).toHaveLength(1);
      expect(payload.groups[0].entries).toHaveLength(1);
      expect(payload.groups[0].entries[0].entryId).toBe(entryId);
      if (reader === "current") {
        expect(payload.groups[0].entries[0].meaningCount).toBe(articleState === "ready" ? 2 : undefined);
        expect(rpc).toHaveBeenCalledWith("read_platform_v2_training_group", {
          p_user_id:"owner",p_entry_id:entryId,p_group_entry_bound:50,
        });
      } else {
        expect(rpc).not.toHaveBeenCalledWith("read_platform_v2_training_group", expect.anything());
      }
      expect(payload.groups[0].entries[0].reportContentRevision).toBe(
        revisionState === "null" ? null : "a".repeat(64),
      );
      expect(
        rpc.mock.calls.filter(
          ([name]) => name === "read_platform_v2_presentation_identity",
        ),
      ).toHaveLength(revisionState === "missing" ? 1 : 0);
      expect(payload.groups[0].entries[0].capabilities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ actionId: "report-content" }),
        ]),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  },
);

});
