import {NextRequest} from 'next/server';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),scope:vi.fn(),abort:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:mock.auth,requirePlatformScope:mock.scope,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}})}));
import {POST} from '@/app/api/library/shared-collections/owned/badges/route';
const id='75600000-0000-4000-8000-000000000001';
const request=(body:unknown,contentType='application/json')=>new NextRequest('http://localhost/api/library/shared-collections/owned/badges',{method:'POST',headers:{'content-type':contentType},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();mock.auth.mockResolvedValue({principal:{authKind:'first_party'},user:{id},supabase:{rpc:mock.rpc}});mock.scope.mockReturnValue(null);mock.rpc.mockReturnValue({abortSignal:mock.abort});mock.abort.mockResolvedValue({data:{openIds:[id]},error:null});});
test('one bounded owner read returns only requested publication IDs with no-store',async()=>{
 const response=await POST(request({ids:[id]}));expect(response.status).toBe(200);expect(await response.json()).toEqual({openIds:[id]});expect(response.headers.get('cache-control')).toBe('no-store');
 expect(mock.rpc).toHaveBeenCalledWith('read_owned_collection_publication_badges_v1',{p_collection_ids:[id]});
});
test.each([{ids:[id],code:'secret'},{ids:[id,id]},{ids:[id,'invalid']},{ids:Array(101).fill(id)},{}])('rejects extra, duplicate or unbounded request %#',async body=>{
 expect((await POST(request(body))).status).toBe(400);expect(mock.rpc).not.toHaveBeenCalled();
});
test('rejects oversized stream, connected caller and wrong content type before RPC',async()=>{
 expect((await POST(request({ids:[id]},'text/plain'))).status).toBe(415);
 const huge=new NextRequest('http://localhost/api/library/shared-collections/owned/badges',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids:[id],padding:'x'.repeat(8192)})});
 expect((await POST(huge)).status).toBe(413);
 mock.auth.mockResolvedValueOnce({principal:{authKind:'connected_client'}});expect((await POST(request({ids:[id]}))).status).toBe(403);
 expect(mock.rpc).not.toHaveBeenCalled();
});
test.each([{openIds:[id],secret:'hidden'},{openIds:[id,id]},{openIds:['75600000-0000-4000-8000-000000000002']}])('closes malformed or foreign response %#',async data=>{
 mock.abort.mockResolvedValueOnce({data,error:null});const response=await POST(request({ids:[id]}));expect(response.status).toBe(502);expect(JSON.stringify(await response.json())).not.toContain('hidden');
});
