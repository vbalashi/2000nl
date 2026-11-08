import {NextRequest} from 'next/server';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),scope:vi.fn(),abort:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:mock.auth,requirePlatformScope:mock.scope,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}})}));
import {GET,POST} from '@/app/api/library/collection-details/route';
const id='75600000-0000-4000-8000-000000000001';
const record={id,name:'Lesson',description:null,source:null,revision:'0',isOwner:true};
const get=(query=`?collectionId=${id}`)=>new NextRequest(`http://localhost/api/library/collection-details${query}`);
const post=(body:unknown)=>new NextRequest('http://localhost/api/library/collection-details',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();mock.auth.mockResolvedValue({principal:{authKind:'first_party'},supabase:{rpc:mock.rpc}});mock.scope.mockReturnValue(null);mock.rpc.mockReturnValue({abortSignal:mock.abort});mock.abort.mockResolvedValue({data:record,error:null});});
test('reads only requested collection, no-store, and rejects foreign projections',async()=>{
 let res=await GET(get());expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('no-store');expect(mock.rpc).toHaveBeenCalledWith('read_collection_details_v1',{p_collection_id:id});
 mock.abort.mockResolvedValueOnce({data:{...record,secret:'private'},error:null});res=await GET(get());expect(res.status).toBe(502);expect(JSON.stringify(await res.json())).not.toContain('private');
 expect((await GET(get(`?collectionId=${id}&userId=x`))).status).toBe(400);
});
test('preserves null, omission and version; maps conflict and unavailable',async()=>{
 const body={collectionId:id,expectedRevision:'0',patch:{description:null,source:{publishedOn:null}}};expect((await POST(post(body))).status).toBe(200);
 expect(mock.rpc).toHaveBeenCalledWith('update_collection_details_v1',{p_collection_id:id,p_expected_revision:'0',p_patch:body.patch});
 mock.abort.mockResolvedValueOnce({error:{code:'40001'},data:null});expect((await POST(post(body))).status).toBe(409);
 mock.abort.mockResolvedValueOnce({error:{code:'42501'},data:null});expect((await GET(get())).status).toBe(404);
 expect((await POST(post({...body,other:'x'}))).status).toBe(400);
});
