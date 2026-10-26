import {NextRequest} from 'next/server';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({auth:vi.fn(),scope:vi.fn(),rpc:vi.fn(),abort:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:mock.auth,requirePlatformScope:mock.scope,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}})}));
import {GET,POST} from '@/app/api/library/collections/training-catalog/route';
const id='75600000-0000-4000-8000-000000000001',other='75600000-0000-4000-8000-000000000002',row={id,name:'Lesson',ownership:'received',availableItemCount:2};
const get=(query='?languageCode=nl')=>new NextRequest('http://localhost/api/library/collections/training-catalog'+query);
const post=(ids:string[])=>new NextRequest('http://localhost/api/library/collections/training-catalog',{method:'POST',body:JSON.stringify({languageCode:'nl',collectionIds:ids})});
beforeEach(()=>{vi.resetAllMocks();mock.auth.mockResolvedValue({principal:{authKind:'first_party'},supabase:{rpc:mock.rpc}});mock.scope.mockReturnValue(null);mock.rpc.mockReturnValue({abortSignal:mock.abort});mock.abort.mockResolvedValue({data:{collections:[row],nextCursor:null},error:null});});
test('one bounded read returns only the selected training projection',async()=>{const response=await GET(get());expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(mock.rpc).toHaveBeenCalledWith('read_training_collection_catalog_v1',{p_query:'',p_language_code:'nl',p_cursor:null,p_limit:50});});
test('rejects malformed cursors, duplicate fields and connected clients before RPC',async()=>{
 for(const query of ['?languageCode=nl&limit=500','?languageCode=nl&cursor=bad','?languageCode=nl&languageCode=en'])expect((await GET(get(query))).status).toBe(400);
 expect(mock.rpc).not.toHaveBeenCalled();mock.auth.mockResolvedValueOnce({principal:{authKind:'connected_client'}});expect((await GET(get())).status).toBe(403);
});
test('exact stored references cannot return unrelated collection metadata',async()=>{
 mock.abort.mockResolvedValueOnce({data:{collections:[{...row,id:other}]},error:null});expect((await POST(post([id]))).status).toBe(502);
 expect((await POST(post([id,id]))).status).toBe(400);expect((await POST(post(Array(101).fill(id)))).status).toBe(400);
});
