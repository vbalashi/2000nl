import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const {auth,service,rpc,scope} = vi.hoisted(()=>({auth:vi.fn(),service:vi.fn(),rpc:vi.fn(),scope:vi.fn()}));
vi.mock("@/lib/platform/serverSupabase",()=>({getAuthenticatedSupabase:auth,getPlatformServiceSupabase:service,requirePlatformScope:scope,jsonNoStore:(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}})}));
vi.mock("@/lib/platform/platformV2Rollout",()=>({platformV2LookupEnabled:()=>true}));
import { POST } from "@/app/api/library/category-search/route";
const dictionary='8746de41-779a-444d-be38-287efc416d8f';
const respond=(data:unknown,error:unknown=null)=>rpc.mockReturnValue({abortSignal:vi.fn().mockResolvedValue({data,error})});
const base={query:'ontmut',languageCode:'nl',group:'headwords',filters:{parts:['verb'],article:null}};
const request=(body:unknown)=>new NextRequest('http://localhost/api/library/category-search',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();auth.mockResolvedValue({principal:{authKind:'first_party',userId:'reader'}});service.mockReturnValue({supabase:{rpc}});scope.mockReturnValue(null);respond({groups:[]});});
test('uses only authenticated identity and passes canonical dictionary and part scope to the service',async()=>{
 const response=await POST(request({...base,userId:'victim',dictionaryIds:[dictionary.toUpperCase(),dictionary]}));
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
 expect(rpc).toHaveBeenCalledWith('search_library_category_v1',expect.objectContaining({p_user_id:'reader',p_dictionary_ids:[dictionary],p_filters:base.filters,p_material:null}));
});
test('carries collection identity without accepting client-selected owners or entry IDs',async()=>{
 const material={kind:'collection',id:dictionary,collectionType:'user'};
 expect((await POST(request({...base,material}))).status).toBe(200);
 expect(rpc).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({p_material:material,p_dictionary_ids:null}));
 expect((await POST(request({...base,material:{...material,ownerId:'victim'}}))).status).toBe(400);
 expect((await POST(request({...base,material,dictionaryIds:[dictionary]}))).status).toBe(400);
});
test('rejects connected callers, unauthenticated callers, unsafe cursors and invalid filters before service work',async()=>{
 auth.mockResolvedValue(Response.json({}, {status:401}));expect((await POST(request(base))).status).toBe(401);
 auth.mockResolvedValue({principal:{authKind:'connected_client',userId:'reader'}});expect((await POST(request(base))).status).toBe(403);expect(service).not.toHaveBeenCalled();
 auth.mockResolvedValue({principal:{authKind:'first_party',userId:'reader'}});
 for(const invalid of [{filters:{parts:['unknown']}},{limit:1000},{cursor:'x'.repeat(5000)},{group:'bogus'},{query:'x'.repeat(201)}]) expect((await POST(request({...base,...invalid}))).status).toBe(400);
 expect(rpc).not.toHaveBeenCalled();
});
test('preserves unavailable-material and invalidated-cursor failures instead of broadening the search',async()=>{
 respond({error:'material_not_accessible'});expect((await POST(request(base))).status).toBe(404);
 respond({error:'invalid_cursor'});expect((await POST(request(base))).status).toBe(400);
 respond(null,{message:'private backend details'});const response=await POST(request(base));expect(response.status).toBe(500);expect(await response.text()).not.toContain('private backend');
});
