import {NextRequest} from 'next/server';
import {beforeEach,test,expect,vi} from 'vitest';
const {auth,rpc,scope}=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),scope:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:auth,requirePlatformScope:scope,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}})}));
import {POST as prepare} from '@/app/api/library/label-sharing/composition/prepare/route';
import {POST as confirm} from '@/app/api/library/label-sharing/composition/confirm/route';
import {GET as receipt} from '@/app/api/library/label-sharing/composition/receipt/route';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const post=(body:unknown)=>new NextRequest('http://localhost/api/library/label-sharing/composition',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const get=()=>new NextRequest(`http://localhost/api/library/label-sharing/composition/receipt?planId=${id}`);
const result=(data:unknown,error:unknown=null)=>rpc.mockReturnValue({abortSignal:async()=>({data,error})});
beforeEach(()=>{vi.clearAllMocks();scope.mockReturnValue(null);auth.mockResolvedValue({principal:{authKind:'first_party'},supabase:{rpc}});});
test('all composition endpoints require first-party scoped authentication before RPC',async()=>{
 for(const deny of [Response.json({error:'unauthorized'},{status:401}),{principal:{authKind:'connected_client'}}]){
  auth.mockResolvedValue(deny);
  for(const response of [await prepare(post({})),await confirm(post({})),await receipt(get())])expect(response.status).toBe(deny instanceof Response?401:403);
 }
 auth.mockResolvedValue({principal:{authKind:'first_party'},supabase:{rpc}});scope.mockReturnValue(Response.json({error:'scope_denied'},{status:403}));
 expect((await confirm(post({planId:id}))).status).toBe(403);expect(rpc).not.toHaveBeenCalled();
});
test('prepare cannot accept an owner override or a different target/action in server response',async()=>{
 expect((await prepare(post({collectionId:id,operation:{action:'delete'},userId:id}))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
 result({planId:id,collectionId:other,action:'delete',audience:[]});
 expect((await prepare(post({collectionId:id,operation:{action:'delete'}}))).status).toBe(502);
 result({planId:id,collectionId:id,action:'add',audience:[]});
 expect((await prepare(post({collectionId:id,operation:{action:'delete'}}))).status).toBe(502);
});
test('receipt exposes immutable scope without executing a pending plan',async()=>{
 const pending={planId:id,collectionId:other,action:'remove',status:'pending'};result(pending);
 const response=await receipt(get());expect(response.status).toBe(200);expect(await response.json()).toEqual(pending);
 expect(response.headers.get('cache-control')).toBe('no-store');
 expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('read_collection_composition_plan_v1',{p_plan_id:id});
 result({planId:id,status:'pending'});expect((await receipt(get())).status).toBe(502);
});
test('unknown plans disclose no target and malformed requests never execute a plan',async()=>{
 result({planId:id,status:'unknown'});expect(await (await receipt(get())).json()).toEqual({planId:id,status:'unknown'});
 rpc.mockClear();expect((await confirm(post({planId:id,userId:other}))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
test('confirm maps stale audiences to a conflict and validates receipt identity',async()=>{
 result(null,{message:'collection_audience_changed',code:'40001'});expect((await confirm(post({planId:id}))).status).toBe(409);
 result({planId:other,collectionId:id,status:'committed'});expect((await confirm(post({planId:id}))).status).toBe(502);
 result({planId:id,collectionId:id,status:'committed'});expect((await confirm(post({planId:id}))).status).toBe(200);
});
