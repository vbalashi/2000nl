import { NextRequest } from 'next/server';
import { beforeEach,expect,test,vi } from 'vitest';
const mock=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),scope:vi.fn(),abort:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:mock.auth,requirePlatformScope:mock.scope,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}})}));
import { GET } from '@/app/api/library/shared-collections/received/route';
const owner='75600000-0000-4000-8000-000000000001',viewer='75600000-0000-4000-8000-000000000002',id='75600000-0000-4000-8000-000000000003';
const row={id,name:'Lesson',createdAt:'2026-01-01T00:00:00+00:00',addedAt:'2026-01-02T00:00:00+00:00',ownerUserId:owner,role:'viewer',itemCount:2,labelIds:[]};
const page={revision:0,collections:[row],nextCursor:null};
const request=(search='')=>new NextRequest('http://localhost/api/library/shared-collections/received'+search);
beforeEach(()=>{vi.resetAllMocks();mock.auth.mockResolvedValue({principal:{authKind:'first_party'},user:{id:viewer},supabase:{rpc:mock.rpc}});mock.scope.mockReturnValue(null);mock.rpc.mockReturnValue({abortSignal:mock.abort});mock.abort.mockResolvedValue({data:page,error:null});});
test('read-only query passes normalized filters and returns only a validated no-store page',async()=>{
 const response=await GET(request('?query=+Alpha+&sort=name&limit=20'));expect(response.status).toBe(200);expect(await response.json()).toEqual(page);expect(response.headers.get('cache-control')).toBe('no-store');
 expect(mock.rpc).toHaveBeenCalledWith('read_received_collection_catalog_v1',{p_query:'Alpha',p_sort:'name',p_scope:'all',p_label_id:null,p_cursor:null,p_limit:20});expect(mock.abort).toHaveBeenCalledWith(expect.any(AbortSignal));
});
test.each(['?userId=other','?code=secret','?sort=name&sort=count','?limit=01','?scope=label','?scope=all&labelId='+id,'?cursor=no-json','?limit=101'])('rejects invalid or extra input %s without RPC',async search=>{
 expect((await GET(request(search))).status).toBe(400);expect(mock.rpc).not.toHaveBeenCalled();
});
test('rejects unauthenticated, connected and insufficient-scope requests',async()=>{
 mock.auth.mockResolvedValueOnce(Response.json({error:'unauthorized'},{status:401}));expect((await GET(request())).status).toBe(401);
 mock.auth.mockResolvedValueOnce({principal:{authKind:'connected_client'}});expect((await GET(request())).status).toBe(403);
 mock.scope.mockReturnValueOnce(Response.json({error:'missing_scope'},{status:403}));expect((await GET(request())).status).toBe(403);expect(mock.rpc).not.toHaveBeenCalled();
});
test.each([{...page,secret:'hidden'},{...page,collections:[{...row,invitationCode:'hidden'}]},{...page,collections:[row,row]},{...page,collections:[{...row,ownerUserId:viewer}]},{...page,nextCursor:{id,key:'lesson',scope:'a'.repeat(64)}}])('rejects malformed or unrelated response %#',async data=>{
 mock.abort.mockResolvedValueOnce({data,error:null});const response=await GET(request());expect(response.status).toBe(502);expect(JSON.stringify(await response.json())).not.toContain('hidden');
});
test.each([['label_not_found',404],['invalid_catalog_cursor',400],['internal password=secret',503]])('maps closed errors %s',async(message,status)=>{
 mock.abort.mockResolvedValueOnce({data:null,error:{message}});const response=await GET(request());expect(response.status).toBe(status);expect(JSON.stringify(await response.json())).not.toContain('password');
});
test('thrown transport diagnostics remain closed',async()=>{
 mock.abort.mockRejectedValueOnce(new Error('private connection details'));const response=await GET(request());expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'received_catalog_unavailable'});
});
