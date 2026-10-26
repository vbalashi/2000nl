import {NextRequest} from 'next/server';
import {beforeEach,expect,test,vi} from 'vitest';
const {auth,rpc,scope}=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),scope:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:auth,requirePlatformScope:scope,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}})}));
import {GET} from '@/app/api/library/entries/[entryId]/note-material/route';
const entryId='75600000-0000-4000-8000-000000000002',ctx={params:Promise.resolve({entryId})};
const note={noteId:'note',ownerUserId:'teacher',text:'Provided material',revision:'9007199254740993',isOwn:false};
const request=(query='')=>new NextRequest('http://localhost/notes'+query);
beforeEach(()=>{vi.resetAllMocks();auth.mockResolvedValue({principal:{authKind:'first_party'},supabase:{rpc}});scope.mockReturnValue(null);rpc.mockResolvedValue({data:{entries:[{entryId,notes:[note]}]},error:null});});
test('reads only requested live scope without an author/permit supplied by the caller',async()=>{
 const response=await GET(request(),ctx);expect(await response.json()).toEqual({entryId,notes:[note]});expect(response.headers.get('cache-control')).toBe('no-store');expect(rpc).toHaveBeenCalledWith('read_entry_note_material_v1',{p_entry_ids:[entryId]});
 expect((await GET(request('?permitId=borrowed'),ctx)).status).toBe(400);
});
test('rejects connected or unauthenticated clients before RPC',async()=>{
 auth.mockResolvedValue({principal:{authKind:'connected_client'}});expect((await GET(request(),ctx)).status).toBe(403);
 auth.mockResolvedValue(Response.json({error:'unauthorized'},{status:401}));expect((await GET(request(),ctx)).status).toBe(401);expect(rpc).not.toHaveBeenCalled();
});
test.each([{entries:[]},{entries:[{entryId:'wrong',notes:[note]}]},{entries:[{entryId,notes:[{...note,diagnostics:'secret'}]}]},{entries:[{entryId,notes:[note,note]}]},{entries:[{entryId,notes:[note]}],raw:'secret'}])('rejects unknown or mismatched material response case%#',async data=>{
 rpc.mockResolvedValue({data,error:null});expect((await GET(request(),ctx)).status).toBe(502);
});
test.each([['42501','private diagnostic',404,'note_entry_unavailable'],['PGRST202','missing',503,'notes_not_available'],['22023','note_material_too_large',422,'note_material_too_large']])('closed failure:%s',async(code,message,status,key)=>{
 rpc.mockResolvedValue({data:null,error:{code,message}});const response=await GET(request(),ctx);expect(response.status).toBe(status);expect(await response.json()).toEqual({error:key});
});
