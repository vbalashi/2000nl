import {beforeEach,expect,test,vi} from 'vitest';
import {NextRequest} from 'next/server';
const rpc=vi.fn(),auth=vi.fn();
vi.mock('@/lib/diagnostics/server',()=>({withTrainingDiagnostics:(_route:string,handler:unknown)=>handler}));
vi.mock('@/lib/platform/platformV2Rollout',()=>({platformV2ActionsEnabled:()=>true}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:auth,getPlatformServiceSupabase:()=>({supabase:{rpc}}),requirePlatformScope:()=>null,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status})}));
const {POST}=await import('@/app/api/training/known-choice/route');
const id='00000000-0000-4000-8000-000000000001';
const body={entryId:id,trainingSessionId:id,currentDirection:'word-to-definition',knownDirections:['word-to-definition'],revision:'a'.repeat(64),clientEventId:id};
const post=(value:unknown)=>POST(new NextRequest('http://localhost/api/training/known-choice',{method:'POST',body:JSON.stringify(value)}));
beforeEach(()=>{vi.clearAllMocks();auth.mockResolvedValue({principal:{userId:'server-owner',authKind:'first_party'}});rpc.mockResolvedValue({data:{status:'accepted'},error:null});});
test('derives principal and passes the complete intent to one atomic boundary',async()=>{
 expect((await post(body)).status).toBe(200);expect(rpc).toHaveBeenCalledWith('set_training_known_directions_as_principal_v1',{p_user_id:'server-owner',p_entry_id:id,p_session_id:id,p_current_direction:'word-to-definition',p_known_directions:['word-to-definition'],p_expected_revision:body.revision,p_client_event_id:id});
});
test('rejects injected principals, malformed directions, duplicates and missing session',async()=>{
 for(const value of [{...body,userId:'other'},{...body,knownDirections:['idiom:direct']},{...body,knownDirections:['word-to-definition','word-to-definition']},{...body,trainingSessionId:null},null])expect((await post(value)).status).toBe(400);
 expect(rpc).not.toHaveBeenCalled();
});
test('refuses unauthenticated and connected clients',async()=>{
 auth.mockResolvedValueOnce(new Response(null,{status:401}));expect((await post(body)).status).toBe(401);
 auth.mockResolvedValueOnce({principal:{userId:'owner',authKind:'connected_client'}});expect((await post(body)).status).toBe(403);expect(rpc).not.toHaveBeenCalled();
});
test('reports bounded conflict codes without exposing raw database errors',async()=>{
 rpc.mockResolvedValue({data:null,error:{message:'meaning_progress_conflict private internal data'}});const result=await post(body);expect(result.status).toBe(409);expect(await result.json()).toEqual({error:'meaning_progress_conflict'});
});
