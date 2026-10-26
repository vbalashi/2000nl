import {NextRequest} from 'next/server';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),scope:vi.fn(),abort:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:mock.auth,requirePlatformScope:mock.scope,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}})}));
import {GET as ownedGET} from '@/app/api/library/shared-collections/owned/route';
import {GET as overviewGET} from '@/app/api/library/shared-collections/overview/route';
const id='75600000-0000-4000-8000-000000000003';
const row={id,name:'Lesson',createdAt:'2026-01-01T00:00:00+00:00',itemCount:2,subscriberCount:1};
const page={collections:[row],nextCursor:null},overview={sharedByMe:1,addedByMe:2};
const request=(path:string,search='')=>new NextRequest('http://localhost/api/library/shared-collections/'+path+search);
beforeEach(()=>{vi.resetAllMocks();mock.auth.mockResolvedValue({principal:{authKind:'first_party'},user:{id},supabase:{rpc:mock.rpc}});mock.scope.mockReturnValue(null);mock.rpc.mockReturnValue({abortSignal:mock.abort});mock.abort.mockResolvedValue({data:page,error:null});});
test('owned search returns bounded code-free metadata through read-only scoped RPC',async()=>{
 const response=await ownedGET(request('owned','?query=+Lesson+&sort=name&limit=20'));
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toEqual(page);
 expect(mock.rpc).toHaveBeenCalledWith('read_owned_shared_collection_catalog_v1',{p_query:'Lesson',p_sort:'name',p_cursor:null,p_limit:20});
});
test.each(['?code=secret','?userId=other','?sort=name&sort=count','?limit=01','?cursor=no-json','?limit=101'])('owned search rejects extra or malformed input %s',async search=>{
 expect((await ownedGET(request('owned',search))).status).toBe(400);expect(mock.rpc).not.toHaveBeenCalled();
});
test.each([{...page,secret:'hidden'},{...page,collections:[{...row,invitationCode:'hidden'}]},{...page,collections:[row,row]},{...page,collections:[{...row,subscriberCount:-1}]},{...page,nextCursor:{id,key:'Lesson',scope:'a'.repeat(64)}}])('owned search rejects malformed projection %#',async data=>{
 mock.abort.mockResolvedValueOnce({data,error:null});const response=await ownedGET(request('owned'));expect(response.status).toBe(502);expect(JSON.stringify(await response.json())).not.toContain('hidden');
});
test('overview returns two scoped counts and no invitation material',async()=>{
 mock.abort.mockResolvedValueOnce({data:overview,error:null});const response=await overviewGET(request('overview'));
 expect(response.status).toBe(200);expect(await response.json()).toEqual(overview);expect(mock.rpc).toHaveBeenCalledWith('read_collection_sharing_overview_v1');
});
test('overview fails closed on extra fields, internal diagnostics and connected client',async()=>{
 mock.abort.mockResolvedValueOnce({data:{...overview,code:'secret'},error:null});expect((await overviewGET(request('overview'))).status).toBe(502);
 mock.abort.mockResolvedValueOnce({data:null,error:{message:'private password=secret'}});const response=await overviewGET(request('overview'));expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('secret');
 mock.auth.mockResolvedValueOnce({principal:{authKind:'connected_client'}});expect((await ownedGET(request('owned'))).status).toBe(403);
});
