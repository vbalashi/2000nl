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
      p_group_limit: 25,
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

test("filtered queries use the new RPC and carry empty-result first-party counts",async()=>{
 const c=context();vi.mocked(c.service.supabase.rpc).mockResolvedValue({data:{items:[],page:{selectedTierComplete:true,nextGroupCursor:null,totalGroups:0}},error:null} as never);
 const filters={parts:["noun" as const],article:"het" as const};
 const result=await performPlatformV2Lookup(c,request,{dictionaryIds:null,filters});
 expect(result.status).toBe(200);expect(result.payload).toMatchObject({librarySearch:{totalGroups:0,matchingEntryIds:[]}});
 expect(c.service.supabase.rpc).toHaveBeenCalledWith("lookup_platform_v2_library_filtered_entries",expect.objectContaining({p_user_id:"actual-owner",p_dictionary_ids:null,p_filters:filters}));
});
test("invalid filtered counts fail closed; DB filter errors remain 400",async()=>{
 const c=context();
 for(const totalGroups of [undefined,-1,1.5,"3"]){
  vi.mocked(c.service.supabase.rpc).mockResolvedValue({data:{items:[],page:{totalGroups}},error:null} as never);
  expect((await performPlatformV2Lookup(c,request,{dictionaryIds:null,filters:{parts:[],article:null}})).status).toBe(409);
 }
 vi.mocked(c.service.supabase.rpc).mockResolvedValue({data:{error:"invalid_library_filters"},error:null} as never);
 expect(await performPlatformV2Lookup(c,request,{dictionaryIds:null,filters:{parts:[],article:null}})).toMatchObject({status:400,payload:{error:"invalid_library_filters"}});
});


test("only classified Library database cancellations become retryable without leaking SQL", async () => {
  const c = context();
  for (const [code, status] of [["57014",503],["42501",500],["XX000",500]] as const) {
    vi.mocked(c.service.supabase.rpc).mockResolvedValue({data:null,error:{code,message:"private SQL and principal details"}} as never);
    const result=await performPlatformV2Lookup(c,request,{dictionaryIds:null,filters:{parts:[],article:null}});
    expect(result.status).toBe(status);
    expect(result.payload).toEqual({error:code==="57014"?"library_search_timeout":"lookup_failed"});
    expect(result.serverTiming).toMatch(/lookup.db;dur=/);
  }
  vi.mocked(c.service.supabase.rpc).mockResolvedValue({data:null,error:{code:"57014"}} as never);
  expect((await performPlatformV2Lookup(c,request)).status).toBe(500);
});

test("material queries bind only the authenticated principal and fail closed for missing membership metadata", async () => {
  const c=context(); const material={kind:"label" as const,id:"8746de41-779a-444d-be38-287efc416d8f"};
  const rpc=vi.mocked(c.service.supabase.rpc);
  rpc.mockResolvedValue({data:{items:[],page:{totalGroups:0,matchingEntryIds:[],unavailableEntryCount:0,selectedTierComplete:true,nextGroupCursor:null}},error:null} as never);
  expect((await performPlatformV2Lookup(c,request,{dictionaryIds:null,material})).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("lookup_platform_v2_library_material_entries",expect.objectContaining({p_user_id:"actual-owner",p_dictionary_ids:null,p_material:material}));
  for(const matchingEntryIds of [undefined,null,["foreign-entry"]]) {
    rpc.mockResolvedValue({data:{items:[],page:{totalGroups:0,matchingEntryIds}},error:null} as never);
    expect((await performPlatformV2Lookup(c,request,{dictionaryIds:null,material})).status).toBe(409);
  }
  rpc.mockResolvedValue({data:{error:"material_not_accessible"},error:null} as never);
  expect(await performPlatformV2Lookup(c,request,{dictionaryIds:null,material})).toMatchObject({status:404,payload:{error:"material_not_accessible"}});
});

test("current-target content cannot be projected as a different entry/card or borrowed by connected clients",async()=>{
 const permit={sessionId:"session",permitId:"permit"};
 const c=context();const currentRpc=vi.fn();c.auth.supabase={rpc:currentRpc} as never;
 const exact={...request,query:undefined,entryId:"entry",cardTypeId:"definition-to-word" as const,intent:"training-review" as const};
 for(const currentTarget of [undefined,{...permit,entryId:"other",cardTypeId:"word-to-definition"},{...permit,entryId:"entry",cardTypeId:"listen-type"}]){
  currentRpc.mockResolvedValue({data:{items:[],currentTarget,page:{}},error:null});
  expect((await performPlatformV2Lookup(c,exact,undefined,permit)).status).toBe(403);
 }
 currentRpc.mockResolvedValue({data:{error:"current_training_permit_invalid"},error:null});
 expect((await performPlatformV2Lookup(c,exact,undefined,permit)).status).toBe(403);
 const connected=context("connected_client");
 expect((await performPlatformV2Lookup(connected,exact,undefined,permit)).status).toBe(403);
 expect(connected.service.supabase.rpc).not.toHaveBeenCalled();
 expect(c.service.supabase.rpc).not.toHaveBeenCalled();
});
