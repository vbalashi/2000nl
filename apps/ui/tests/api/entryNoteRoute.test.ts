import {NextRequest} from 'next/server';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
const {authenticate,rpc,scope}=vi.hoisted(()=>({authenticate:vi.fn(),rpc:vi.fn(),scope:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:authenticate,requirePlatformScope:scope,
 jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}})}));
import {GET,PUT} from '@/app/api/library/entries/[entryId]/note/route';
const entryId='75600000-0000-4000-8000-0000000000ab';
const context={params:Promise.resolve({entryId})};
const owner={user:{id:'actual-user'},principal:{authKind:'first_party'},supabase:{rpc}};
const payload={entryId,notes:'my note',revision:'9007199254740993'};
const req=(body?:unknown,query='')=>new NextRequest('http://localhost/api/library/entries/'+entryId+'/note'+query,
 body===undefined?{}:{method:'PUT',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();authenticate.mockResolvedValue(owner);scope.mockReturnValue(null);rpc.mockResolvedValue({data:payload,error:null});vi.stubEnv('COLLECTION_SHARING_WRITES_ENABLED','true');});
afterEach(()=>{vi.unstubAllEnvs();});
test('own read is no-store, principal-derived and stays available during write rollback',async()=>{
 vi.stubEnv('COLLECTION_SHARING_WRITES_ENABLED','false');const response=await GET(req(),context);
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toEqual(payload);
 expect(rpc).toHaveBeenCalledWith('read_entry_note_v1',{p_entry_id:entryId});
 expect((await PUT(req({expectedRevision:'0',notes:'new'}),context)).status).toBe(503);expect(rpc).toHaveBeenCalledTimes(1);
});
test('compare-and-write passes exact bigint text and no body-supplied owner',async()=>{
 const response=await PUT(req({expectedRevision:'9007199254740992',notes:'my note'}),context);
 expect(response.status).toBe(200);expect(await response.json()).toEqual(payload);
 expect(rpc).toHaveBeenCalledWith('write_entry_note_v1',{p_entry_id:entryId,p_expected_revision:'9007199254740992',p_notes:'my note'});
});
test('explicit null removes a note through the same revision command',async()=>{
 rpc.mockResolvedValue({data:{...payload,notes:null,revision:'4'},error:null});
 expect((await PUT(req({expectedRevision:'3',notes:null}),context)).status).toBe(200);
 expect(rpc.mock.calls[0][1].p_notes).toBeNull();
});
test.each(['read','write'])('%s rejects connected clients, denied scope and anonymous before any RPC',async method=>{
 const call=()=>method==='read'?GET(req(),context):PUT(req({expectedRevision:'0',notes:'new'}),context);
 authenticate.mockResolvedValue({...owner,principal:{authKind:'connected_client'}});expect((await call()).status).toBe(403);
 authenticate.mockResolvedValue(owner);scope.mockReturnValue(Response.json({error:'scope_required'},{status:403}));expect((await call()).status).toBe(403);
 authenticate.mockResolvedValue(Response.json({error:'unauthorized'},{status:401}));expect((await call()).status).toBe(401);expect(rpc).not.toHaveBeenCalled();
});
test.each([
 {expectedRevision:0,notes:'text'}, {expectedRevision:'01',notes:'text'}, {expectedRevision:'-1',notes:'text'},
 {expectedRevision:'9223372036854775808',notes:'text'}, {expectedRevision:'0',notes:'text',userId:'victim'},
 {expectedRevision:'0',notes:'text',noteId:'foreign'}, {expectedRevision:'0',notes:'😀'.repeat(16385)},
 {expectedRevision:'0',notes:'nul\0text'}, {expectedRevision:'0',notes:'\ud800'}, {expectedRevision:'0',notes:[]},
 {notes:'text'}, null,
])('rejects invalid or forged command case%#',async body=>{
 expect((await PUT(req(body),context)).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
test('accepts the exact Unicode byte boundary and max bigint token',async()=>{
 const notes='😀'.repeat(16384);rpc.mockResolvedValue({data:{entryId,notes,revision:'9223372036854775807'},error:null});
 expect((await PUT(req({expectedRevision:'9223372036854775807',notes}),context)).status).toBe(200);
});
test('HTTP stream budget is bounded, and malformed UTF-8 is not silently replaced',async()=>{
 const huge=new NextRequest('http://localhost/note',{method:'PUT',body:' '.repeat(400*1024+1)});
 expect((await PUT(huge,context)).status).toBe(400);
 const invalid=new NextRequest('http://localhost/note',{method:'PUT',body:new Uint8Array([0xff])});
 expect((await PUT(invalid,context)).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
test.each([['note_changed','40001',409,'note_changed'],['private diagnostics','42501',404,'note_entry_unavailable'],
 ['invalid_note_request','22023',422,'invalid_note_request'],['missing implementation','PGRST202',503,'notes_not_available'],
 ['secret text','XX000',500,'note_request_failed']])('closed error contract:%s',async(message,code,status,key)=>{
 rpc.mockResolvedValue({data:null,error:{message,code}});const response=await PUT(req({expectedRevision:'0',notes:'new'}),context);
 expect(response.status).toBe(status);expect(await response.json()).toEqual({error:key});
});
test.each([{...payload,entryId:'wrong'},{...payload,revision:1},{...payload,ownerUserId:'hidden'},{...payload,notes:{secret:'raw'}}])('rejects malformed upstream response case%#',async data=>{
 rpc.mockResolvedValue({data,error:null});const response=await GET(req(),context);expect(response.status).toBe(502);expect(await response.json()).toEqual({error:'note_contract_invalid'});
});
test('canonicalizes UUIDs and rejects query parameters before a read',async()=>{
 expect((await GET(req(),{params:Promise.resolve({entryId:entryId.toUpperCase()})})).status).toBe(200);
 expect(rpc).toHaveBeenLastCalledWith('read_entry_note_v1',{p_entry_id:entryId});rpc.mockClear();
 expect((await GET(req(undefined,'?userId=victim'),context)).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});

test.each([{...payload,notes:'unexpected text',revision:'4'},{...payload,notes:'new',revision:'9'},{...payload,notes:'new',revision:'2'}])('write acknowledgement must match intended text and exact clock transition case%#',async data=>{
 rpc.mockResolvedValue({data,error:null});expect((await PUT(req({expectedRevision:'3',notes:'new'}),context)).status).toBe(502);
});
test.each([undefined,'TRUE','1'])('HTTP writes default closed unless the private server flag is exactly true (%s)',async flag=>{
 vi.stubEnv('COLLECTION_SHARING_WRITES_ENABLED',flag??'');if(flag===undefined)delete process.env.COLLECTION_SHARING_WRITES_ENABLED;vi.stubEnv('NEXT_PUBLIC_COLLECTION_SHARING_WRITES_ENABLED','true');
 expect((await PUT(req({expectedRevision:'0',notes:'new'}),context)).status).toBe(503);expect(rpc).not.toHaveBeenCalled();
});
test('transport exceptions are closed and never return their private text',async()=>{
 rpc.mockRejectedValue(new Error('private transport details'));const response=await GET(req(),context);
 expect(response.status).toBe(500);expect(await response.json()).toEqual({error:'note_request_failed'});
});
test('DB rollout denial remains a closed service-unavailable response when the HTTP flag is on',async()=>{
 rpc.mockResolvedValue({data:null,error:{message:'sharing_writes_disabled',code:'55000'}});
 const response=await PUT(req({expectedRevision:'0',notes:'new'}),context);expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'sharing_writes_disabled'});
});
