import {NextRequest} from 'next/server';
import {beforeEach,expect,test,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mock=vi.hoisted(()=>({auth:vi.fn(),scope:vi.fn(),rpc:vi.fn(),abort:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:mock.auth,requirePlatformScope:mock.scope,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}})}));
import {GET as ownerGET} from '@/app/api/library/collections/[collectionId]/sharing/route';
import {GET as forwardGET} from '@/app/api/library/collections/[collectionId]/sharing/forward/route';
const collectionId='75600000-0000-4000-8000-000000000001',code='A'.repeat(26);
const owner={collectionId,isOpen:true,revision:1,invitationCode:code,subscriberCount:2};
const forwarding={collectionId,canForward:true,invitationCode:code};
const context=(id=collectionId)=>({params:Promise.resolve({collectionId:id})});
const request=(query='')=>new NextRequest('http://localhost/collection/sharing'+query);
beforeEach(()=>{vi.resetAllMocks();mock.auth.mockResolvedValue({principal:{authKind:'first_party'},supabase:{rpc:mock.rpc}});mock.scope.mockReturnValue(null);mock.rpc.mockReturnValue({abortSignal:mock.abort});});
test.each([['owner',ownerGET,owner,'read_collection_share_management_v1'],['forward',forwardGET,forwarding,'read_collection_share_forward_v1']] as const)('%s read is scoped, uncached and never sends an invitation or user ID',async(_mode,GET,data,rpc)=>{
 mock.abort.mockResolvedValue({data,error:null});const result=await GET(request(),context(collectionId.toUpperCase()));expect(await result.json()).toEqual(data);expect(result.headers.get('cache-control')).toBe('no-store');expect(mock.rpc).toHaveBeenCalledWith(rpc,{p_collection_id:collectionId});expect(mock.scope).toHaveBeenCalledWith(expect.anything(),'platform:read');
});
test.each([ownerGET,forwardGET])('auth, first-party and read-scope checks precede RPC',async GET=>{
 mock.auth.mockResolvedValueOnce(Response.json({error:'unauthorized'},{status:401}));expect((await GET(request(),context())).status).toBe(401);
 mock.auth.mockResolvedValueOnce({principal:{authKind:'connected_client'}});expect((await GET(request(),context())).status).toBe(403);
 mock.scope.mockReturnValueOnce(Response.json({error:'scope_required'},{status:403}));expect((await GET(request(),context())).status).toBe(403);expect(mock.rpc).not.toHaveBeenCalled();
});
test.each([ownerGET,forwardGET])('unexpected URL arguments and invalid IDs fail before RPC',async GET=>{
 expect((await GET(request('?code='+code),context())).status).toBe(400);expect((await GET(request(),context('invalid'))).status).toBe(400);expect(mock.rpc).not.toHaveBeenCalled();
});
test.each([{...owner,role:'owner'},{...owner,collectionId:'other'},{...owner,isOpen:false},{...owner,revision:1.1},{...owner,subscriberCount:-1}])('owner contract mismatch %# does not expose code',async data=>{
 mock.abort.mockResolvedValue({data,error:null});const result=await ownerGET(request(),context());expect(result.status).toBe(502);expect(JSON.stringify(await result.json())).not.toContain(code);
});
test.each([{...forwarding,canForward:false},{...forwarding,invitationCode:'fresh but invalid'},{...forwarding,ownerUserId:'secret'}])('forward contract mismatch %# stays closed',async data=>{
 mock.abort.mockResolvedValue({data,error:null});expect((await forwardGET(request(),context())).status).toBe(502);
});
test('retired original invite can be represented without learning the new code',async()=>{
 mock.abort.mockResolvedValue({data:{collectionId,canForward:false,invitationCode:null},error:null});expect(await (await forwardGET(request(),context())).json()).toEqual({collectionId,canForward:false,invitationCode:null});
});
test.each([['42501',404],['PGRST202',503],['internal',503]])('closed RPC error %s',async(code,status)=>{
 mock.abort.mockResolvedValue({data:null,error:{code,message:'private diagnostics'}});const result=await ownerGET(request(),context());expect(result.status).toBe(status);expect(JSON.stringify(await result.json())).not.toContain('diagnostics');
});
test('throwing transport never exposes internal diagnostics',async()=>{
 mock.abort.mockRejectedValue(new Error('credentials secret'));const result=await ownerGET(request(),context());expect(result.status).toBe(503);expect(await result.json()).toEqual({error:'share_read_unavailable'});
});
