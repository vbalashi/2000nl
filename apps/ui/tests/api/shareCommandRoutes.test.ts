import {NextRequest} from 'next/server';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mock=vi.hoisted(()=>({auth:vi.fn(),scope:vi.fn(),rpc:vi.fn(),abort:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:mock.auth,requirePlatformScope:mock.scope,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}})}));
import {POST} from '@/app/api/library/collection-sharing/commands/route';
import {POST as previewPOST} from '@/app/api/library/collection-sharing/preview/route';
import {GET} from '@/app/api/library/collection-sharing/receipts/[operationId]/route';
const operationId='75600000-0000-4000-8000-000000000001',collectionId='75600000-0000-4000-8000-000000000002',code='A'.repeat(26);
const open={operationId,action:'open',collectionId,expectedRevision:0},owner={operationId,status:'committed',action:'open',collectionId,available:true,role:'owner',isOpen:true,revision:1,invitationCode:code};
const req=(value:unknown,query='',type='application/json')=>new NextRequest('http://localhost/commands'+query,{method:'POST',headers:{'content-type':type},body:JSON.stringify(value)});
const context={params:Promise.resolve({operationId})};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('COLLECTION_SHARING_WRITES_ENABLED','true');mock.auth.mockResolvedValue({principal:{authKind:'first_party'},supabase:{rpc:mock.rpc}});mock.scope.mockReturnValue(null);mock.rpc.mockReturnValue({abortSignal:mock.abort});mock.abort.mockResolvedValue({data:owner,error:null});});
afterEach(()=>{vi.unstubAllEnvs();});
test('canonical owner intent has no supplied principal and returns a validated no-store result',async()=>{
 const response=await POST(req(open));expect(await response.json()).toEqual(owner);expect(response.headers.get('cache-control')).toBe('no-store');expect(mock.rpc).toHaveBeenCalledWith('command_collection_share_v1',{p_operation_id:operationId,p_action:'open',p_collection_id:collectionId,p_expected_revision:0,p_code:null,p_reconcile_only:false});expect(mock.scope).toHaveBeenCalledWith(expect.anything(),'platform:write');
});
test('accept carries its code only in the body and returns no owner secret',async()=>{
 const joined={operationId,status:'committed',action:'accept',collectionId,available:true,role:'viewer'};mock.abort.mockResolvedValue({data:joined,error:null});expect(await(await POST(req({operationId,action:'accept',code}))).json()).toEqual(joined);expect(mock.rpc.mock.calls[0][1]).toMatchObject({p_code:code,p_collection_id:null,p_expected_revision:null});
});
test.each(['open','rotate','accept'])('rollback reconciles without executing a fresh %s',async action=>{vi.stubEnv('COLLECTION_SHARING_WRITES_ENABLED','false');mock.abort.mockResolvedValue({data:{operationId,status:'unknown'},error:null});expect((await POST(req(action==='accept'?{operationId,action,code}:{...open,action}))).status).toBe(503);expect(mock.rpc.mock.calls[0][1].p_reconcile_only).toBe(true);});
test.each(['close','unsubscribe'])('rollback permits restrictive %s',async action=>{
 vi.stubEnv('COLLECTION_SHARING_WRITES_ENABLED','false');const result=action==='close'?{...owner,action,isOpen:false,invitationCode:null}:{operationId,status:'committed',action,collectionId,available:false,role:null};mock.abort.mockResolvedValue({data:result,error:null});expect((await POST(req(action==='close'?{...open,action}:{operationId,action,collectionId}))).status).toBe(200);
});
test.each([{...open,userId:'other'},{...open,role:'owner'},{...open,expectedRevision:-1},{operationId,action:'accept',code,collectionId},{operationId,action:'unsubscribe',collectionId,expectedRevision:0},{...open,operationId:'bad'}])('rejects malformed or extra intent fields %#',async value=>{expect((await POST(req(value))).status).toBe(400);expect(mock.rpc).not.toHaveBeenCalled();});
test('query secrets, non-JSON and oversized bodies never reach RPC',async()=>{expect((await POST(req(open,'?code='+code))).status).toBe(400);expect((await POST(req(open,'','text/plain'))).status).toBe(415);expect((await POST(req({padding:'x'.repeat(5000)}))).status).toBe(413);expect(mock.rpc).not.toHaveBeenCalled();});
test.each([['share_operation_conflict','22023',409],['share_revision_conflict','40001',409],['sharing_writes_disabled','55000',503],['private secret','42501',404],['private secret','55P03',409],['private secret','PGRST202',503]])('closed failure %s/%s',async(message,code,status)=>{mock.abort.mockResolvedValue({data:null,error:{message,code}});const response=await POST(req(open));expect(response.status).toBe(status);expect(JSON.stringify(await response.json())).not.toContain('private secret');});
test.each([{...owner,operationId:collectionId},{...owner,collectionId:operationId},{...owner,action:'rotate'},{...owner,rootId:'secret'},{operationId,status:'unknown'},{operationId,status:'committed',action:'open',collectionId,available:true,role:'viewer',invitationCode:code}])('rejects mismatched or secret-bearing acknowledgement %#',async data=>{mock.abort.mockResolvedValue({data,error:null});const response=await POST(req(open));expect(response.status).toBe(502);expect(JSON.stringify(await response.json())).not.toContain(code);});
test('receipt read survives rollback and is bound to the requested operation',async()=>{
 vi.stubEnv('COLLECTION_SHARING_WRITES_ENABLED','false');mock.abort.mockResolvedValue({data:{operationId,status:'unknown'},error:null});expect(await(await GET(new NextRequest('http://localhost/receipt'),context)).json()).toEqual({operationId,status:'unknown'});expect(mock.rpc).toHaveBeenCalledWith('read_collection_share_command_v1',{p_operation_id:operationId});expect(mock.scope).toHaveBeenCalledWith(expect.anything(),'platform:read');
});
test('preview is read-only POST and remains available during rollback',async()=>{
 vi.stubEnv('COLLECTION_SHARING_WRITES_ENABLED','false');const preview={collectionId,name:'Lesson',entryCount:2,offeredRole:'viewer',role:null,alreadyAdded:false,samples:[{headword:'lopen',definition:'Zich te voet voortbewegen.'}]};mock.abort.mockResolvedValue({data:preview,error:null});expect(await(await previewPOST(req({code}))).json()).toEqual(preview);expect(mock.rpc).toHaveBeenCalledWith('preview_collection_share_v1',{p_code:code});expect(mock.scope).toHaveBeenCalledWith(expect.anything(),'platform:read');
});
test.each([{code,userId:'other'},{code:'bad'},{code,role:'viewer'}])('preview rejects invalid/extra payload %#',async value=>{expect((await previewPOST(req(value))).status).toBe(400);expect(mock.rpc).not.toHaveBeenCalled();});
test('preview rejects contradictory membership and invitation leakage',async()=>{for(const data of [{collectionId,name:'Lesson',entryCount:2,offeredRole:'viewer',role:null,alreadyAdded:true,samples:[]},{collectionId,name:'Lesson',entryCount:2,offeredRole:'viewer',role:null,alreadyAdded:false,samples:[],invitationCode:code}]){mock.abort.mockResolvedValue({data,error:null});expect((await previewPOST(req({code}))).status).toBe(502);}});
test.each([{samples:[{headword:'lopen',definition:'x',entryId:collectionId}]},{samples:Array(4).fill({headword:'lopen',definition:null})},{samples:[{headword:'x',definition:'x'.repeat(302)}]}])('preview rejects unbounded or identity-bearing samples %#',async({samples})=>{
 mock.abort.mockResolvedValue({data:{collectionId,name:'Lesson',entryCount:10,offeredRole:'viewer',role:null,alreadyAdded:false,samples},error:null});expect((await previewPOST(req({code}))).status).toBe(502);
});
test('auth and scope failures precede commands',async()=>{mock.auth.mockResolvedValueOnce(Response.json({error:'unauthorized'},{status:401}));expect((await POST(req(open))).status).toBe(401);mock.auth.mockResolvedValueOnce({principal:{authKind:'connected_client'}});expect((await POST(req(open))).status).toBe(403);mock.scope.mockReturnValueOnce(Response.json({error:'scope'},{status:403}));expect((await POST(req(open))).status).toBe(403);expect(mock.rpc).not.toHaveBeenCalled();});
test('transport failure cannot fabricate success or expose diagnostics',async()=>{mock.abort.mockRejectedValue(new Error('private diagnostics'));const response=await POST(req(open));expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'sharing_unavailable'});});

test('completed canonical replay survives the HTTP rollback without admitting a fresh write',async()=>{
 vi.stubEnv('COLLECTION_SHARING_WRITES_ENABLED','false');expect(await(await POST(req(open))).json()).toEqual(owner);expect(mock.rpc.mock.calls[0][1].p_reconcile_only).toBe(true);
});

test('explicit reconciliation hashes full original intent and cannot write even with admission enabled',async()=>{
 const {POST:reconcile}=await import('@/app/api/library/collection-sharing/reconcile/route');
 expect(await(await reconcile(req(open))).json()).toEqual(owner);
 expect(mock.rpc.mock.calls[0][1]).toMatchObject({p_reconcile_only:true,p_expected_revision:0});
 expect(mock.scope).toHaveBeenCalledWith(expect.anything(),'platform:read');
 mock.abort.mockResolvedValue({data:{operationId,status:'unknown'},error:null});
 expect(await(await reconcile(req(open))).json()).toEqual({operationId,status:'unknown'});
 mock.abort.mockResolvedValue({data:null,error:{message:'share_operation_conflict'}});
 expect((await reconcile(req({...open,expectedRevision:2}))).status).toBe(409);
});
test('durable rejected command and receipt are returned as closed account-bound outcomes',async()=>{
 const rejected={operationId,status:'rejected',action:'open',collectionId,reason:'share_revision_conflict'};mock.abort.mockResolvedValue({data:rejected,error:null});expect(await(await POST(req(open))).json()).toEqual(rejected);expect(await(await GET(new NextRequest('http://localhost/receipt'),context)).json()).toEqual(rejected);
});
