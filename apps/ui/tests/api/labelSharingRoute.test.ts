import {NextRequest} from 'next/server';
import {beforeEach,test,expect,vi} from 'vitest';
const {auth,rpc}=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:auth,requirePlatformScope:()=>null,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}})}));
vi.mock('@/lib/collections/sharing/rollout',()=>({collectionSharingWritesEnabled:()=>true}));
import {POST} from '@/app/api/library/label-sharing/commands/route';
const id='11111111-1111-4111-8111-111111111111';
const command={operationId:id,action:'close',labelId:id,expectedRevision:1};
const request=(body:unknown)=>new NextRequest('http://localhost/api/library/label-sharing/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();auth.mockResolvedValue({principal:{authKind:'first_party'},supabase:{rpc}});rpc.mockReturnValue({abortSignal:async()=>({data:{operationId:id,status:'committed',action:'close',result:{labelId:id,isOpen:false,revision:2,invitationCode:null,subscriberCount:0}},error:null})});});
test('rejects retargeted bodies before RPC',async()=>{expect((await POST(request({...command,userId:id}))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();});
test('requires first party and returns no-store validated receipt',async()=>{
 const response=await POST(request(command));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
 expect(rpc).toHaveBeenCalledWith('command_label_share_v1',{p_operation_id:id,p_command:{action:'close',labelId:id,expectedRevision:1},p_reconcile_only:false});
 auth.mockResolvedValue({principal:{authKind:'connected_client'}});expect((await POST(request(command))).status).toBe(403);
});
test('rejects mismatched server receipts',async()=>{rpc.mockReturnValue({abortSignal:async()=>({data:{operationId:id,status:'committed',action:'accept',result:{}},error:null})});expect((await POST(request(command))).status).toBe(502);});
