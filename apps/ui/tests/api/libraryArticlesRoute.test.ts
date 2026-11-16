import {NextRequest} from 'next/server';
import {beforeEach,expect,test,vi} from 'vitest';
const {auth,service,scope,lookup}=vi.hoisted(()=>({auth:vi.fn(),service:vi.fn(),scope:vi.fn(),lookup:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:auth,getPlatformServiceSupabase:service,requirePlatformScope:scope,jsonNoStore:(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}})}));
vi.mock('@/lib/platform/platformV2Rollout',()=>({platformV2LookupEnabled:()=>true}));
vi.mock('@/lib/platform/platformV2LookupService',()=>({performPlatformV2Lookup:lookup}));
import {POST} from '@/app/api/library/articles/route';
const id='11000000-0000-4000-8000-000000000001';
const body={entryIds:[id],languageCode:'nl'};
const request=(value:unknown)=>new NextRequest('http://localhost/api/library/articles',{method:'POST',body:JSON.stringify(value)});
beforeEach(()=>{vi.clearAllMocks();auth.mockResolvedValue({principal:{userId:'reader',authKind:'first_party'}});scope.mockReturnValue(null);service.mockReturnValue({supabase:{}});lookup.mockResolvedValue({status:200,payload:{groups:[]},serverTiming:'lookup.article-batch;dur=2'});});
test('passes server identity to one shared projector, deduplicates entries and disables translations',async()=>{
 const response=await POST(request({...body,entryIds:[id,id.toUpperCase()]}));
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
 expect(lookup).toHaveBeenCalledOnce();expect(lookup).toHaveBeenCalledWith(expect.objectContaining({auth:{principal:{userId:'reader',authKind:'first_party'}},libraryArticleEntryIds:[id]}),expect.objectContaining({translationTargetLanguageCode:null,intent:'dictionary-lookup'}));
});
test('rejects forged scope, oversize batches and malformed IDs before service access',async()=>{
 for(const invalid of [{...body,userId:'victim'},{...body,entryIds:[]},{...body,entryIds:Array(26).fill(id)},{...body,entryIds:['not-uuid']},{...body,languageCode:'invalid language'}])expect((await POST(request(invalid))).status).toBe(400);
 expect(service).not.toHaveBeenCalled();expect(lookup).not.toHaveBeenCalled();
});
test('authentication, connected-client and permission denial cannot enter the batch path',async()=>{
 auth.mockResolvedValue(Response.json({}, {status:401}));expect((await POST(request(body))).status).toBe(401);
 auth.mockResolvedValue({principal:{authKind:'connected_client'}});expect((await POST(request(body))).status).toBe(403);
 auth.mockResolvedValue({principal:{authKind:'first_party'}});scope.mockReturnValue(Response.json({}, {status:403}));expect((await POST(request(body))).status).toBe(403);
 expect(service).not.toHaveBeenCalled();
});
test('propagates revoked content and bounds the projected payload',async()=>{
 lookup.mockResolvedValueOnce({status:404,payload:{error:'entry_not_accessible'}});
 expect((await POST(request(body))).status).toBe(404);
 lookup.mockResolvedValueOnce({status:200,payload:{data:'x'.repeat(8*1024*1024)}});
 expect((await POST(request(body))).status).toBe(413);
});
