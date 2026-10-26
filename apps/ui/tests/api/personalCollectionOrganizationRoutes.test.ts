import {NextRequest} from 'next/server';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mock=vi.hoisted(()=>({auth:vi.fn(),scope:vi.fn(),rpc:vi.fn(),abort:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:mock.auth,requirePlatformScope:mock.scope,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}})}));
import {GET as catalogGET} from '@/app/api/library/collections/catalog/route';
import {GET,PUT} from '@/app/api/library/collections/[collectionId]/labels/route';
const id='75600000-0000-4000-8000-000000000001',label='75600000-0000-4000-8000-000000000002';
const context={params:Promise.resolve({collectionId:id})};
const req=(body?:unknown)=>new NextRequest(`http://localhost/api/library/collections/${id}/labels`,{method:body?'PUT':'GET',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
const snapshot={revision:3,labels:[{id:label,parent_id:null,name:'YouTube',description:null,created_at:'2026-01-01',updated_at:'2026-01-01'}],assignments:[]};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('COLLECTION_SHARING_WRITES_ENABLED','true');mock.auth.mockResolvedValue({principal:{authKind:'first_party'},user:{id},supabase:{rpc:mock.rpc}});mock.scope.mockReturnValue(null);mock.rpc.mockReturnValue({abortSignal:mock.abort});mock.abort.mockResolvedValue({data:{collectionId:id,catalog:snapshot,labelIds:[label]},error:null});});
afterEach(()=>{vi.unstubAllEnvs();});
test('received label GET returns only personal catalog and exact placement, no writes',async()=>{
 const response=await GET(req(),context);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(mock.rpc).toHaveBeenCalledWith('read_received_collection_label_state_v1',{p_collection_id:id});expect(mock.scope).toHaveBeenCalledWith(expect.anything(),'platform:read');
});
test('CAS replacement is first-party explicit and carries no caller identity',async()=>{
 mock.abort.mockResolvedValueOnce({data:{collectionId:id,revision:4,labelIds:[]},error:null});expect((await PUT(req({expectedRevision:3,labelIds:[]}),context)).status).toBe(200);
 expect(mock.rpc).toHaveBeenCalledWith('set_received_collection_labels_v1',{p_collection_id:id,p_expected_revision:3,p_label_ids:[]});expect(mock.scope).toHaveBeenCalledWith(expect.anything(),'platform:write');
});
test('disabled write, extra fields, duplicate labels and connected callers fail before RPC',async()=>{
 vi.stubEnv('COLLECTION_SHARING_WRITES_ENABLED','false');expect((await PUT(req({expectedRevision:3,labelIds:[]}),context)).status).toBe(503);vi.stubEnv('COLLECTION_SHARING_WRITES_ENABLED','true');
 for(const body of [{expectedRevision:3,labelIds:[label,label]},{expectedRevision:3,labelIds:[],ownerId:id}])expect((await PUT(req(body),context)).status).toBe(400);
 mock.auth.mockResolvedValueOnce({principal:{authKind:'connected_client'}});expect((await GET(req(),context)).status).toBe(403);expect(mock.rpc).not.toHaveBeenCalled();
});
test('foreign placement or hidden response fields cannot leave the boundary',async()=>{
 for(const data of [{collectionId:id,catalog:snapshot,labelIds:['75600000-0000-4000-8000-000000000003']},{collectionId:id,catalog:snapshot,labelIds:[],secret:'hidden'}]){mock.abort.mockResolvedValueOnce({data,error:null});expect((await GET(req(),context)).status).toBe(502);}
});
test('write acknowledgement must match both requested labels and CAS clock',async()=>{
 for(const data of [{collectionId:id,revision:4,labelIds:[label]},{collectionId:id,revision:1,labelIds:[]},{collectionId:id,revision:99,labelIds:[]}]){
  mock.abort.mockResolvedValueOnce({data,error:null});expect((await PUT(req({expectedRevision:3,labelIds:[]}),context)).status).toBe(502);
 }
});
test('unified catalog is bounded, literal and source-account derived',async()=>{
 mock.abort.mockResolvedValueOnce({data:{revision:3,collections:[],nextCursor:null},error:null});
 const response=await catalogGET(new NextRequest('http://localhost/api/library/collections/catalog?query=%25&languageCode=nl&limit=20'));
 expect(response.status).toBe(200);expect(mock.rpc).toHaveBeenCalledWith('read_personal_collection_catalog_v1',expect.objectContaining({p_query:'%',p_language_code:'nl',p_limit:20,p_cursor:null}));
 mock.rpc.mockClear();expect((await catalogGET(new NextRequest('http://localhost/api/library/collections/catalog?limit=1000'))).status).toBe(400);expect(mock.rpc).not.toHaveBeenCalled();
});
