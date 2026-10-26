import {NextRequest} from 'next/server';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({auth:vi.fn(),scope:vi.fn(),rpc:vi.fn(),abort:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:mock.auth,requirePlatformScope:mock.scope,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}})}));
import {GET} from '@/app/api/library/shared-collections/received/source/route';
const id='75600000-0000-4000-8000-000000000001';
const request=(search=`?id=${id}`)=>new NextRequest(`http://localhost/api/library/shared-collections/received/source${search}`);
beforeEach(()=>{vi.resetAllMocks();mock.auth.mockResolvedValue({principal:{authKind:'first_party'},user:{id},supabase:{rpc:mock.rpc}});mock.scope.mockReturnValue(null);mock.rpc.mockReturnValue({abortSignal:mock.abort});mock.abort.mockResolvedValue({data:{id,name:'Anna lesson',createdAt:'2026-01-01T00:00:00Z'},error:null});});
test('returns current selected source and no-store',async()=>{const response=await GET(request());expect(response.status).toBe(200);expect(await response.json()).toMatchObject({id,name:'Anna lesson'});expect(response.headers.get('cache-control')).toBe('no-store');expect(mock.rpc).toHaveBeenCalledWith('read_received_collection_source_v1',{p_collection_id:id});});
test('missing current grant is unavailable, without a stale caption',async()=>{mock.abort.mockResolvedValueOnce({data:null,error:null});const response=await GET(request());expect(response.status).toBe(404);expect(JSON.stringify(await response.json())).not.toContain('Anna');});
test('rejects invalid query, connected caller and malformed projection',async()=>{
 for(const search of ['?id=bad',`?id=${id}&id=${id}`,`?id=${id}&code=secret`])expect((await GET(request(search))).status).toBe(400);
 expect(mock.rpc).not.toHaveBeenCalled();mock.auth.mockResolvedValueOnce({principal:{authKind:'connected_client'}});expect((await GET(request())).status).toBe(403);
 mock.abort.mockResolvedValueOnce({data:{id,name:'Anna',createdAt:'2026-01-01T00:00:00Z',code:'secret'},error:null});expect((await GET(request())).status).toBe(502);
});
