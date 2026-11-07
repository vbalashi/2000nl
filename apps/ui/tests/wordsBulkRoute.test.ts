import {beforeEach,expect,test,vi} from 'vitest';
import {NextRequest} from 'next/server';
const {authenticate,rpc}=vi.hoisted(()=>({authenticate:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:authenticate,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status})}));
import {GET,POST,PUT} from '@/app/api/library/bulk-collection/route';
const group='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',list='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const input={groups:[group],all:false,category:'browse',query:'',language:'nl',dictionaryIds:null,filters:{parts:[],article:null},listId:list};
const request=(body:unknown)=>new NextRequest('http://localhost/api/library/bulk-collection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{rpc.mockReset();authenticate.mockReset().mockResolvedValue({principal:{authKind:'first_party'},supabase:{rpc}});});
test('passes only a validated scope and plan to the authenticated RPC',async()=>{
 rpc.mockResolvedValue({data:{articleCount:1,meaningCount:2,planId:group,audience:[]},error:null});
 const result=await POST(request(input));expect(result.status).toBe(200);
 expect(rpc).toHaveBeenCalledWith('prepare_words_bulk_collection_v1',expect.objectContaining({p_groups:[group],p_list_id:list,p_all:false}));
});
test('rejects duplicate articles, unknown fields and malformed confirmation tokens',async()=>{
 for(const body of [{...input,groups:[group,group]}, {...input,userId:'other'}, {...input,fingerprint:'bad'}]) expect((await POST(request(body))).status).toBe(400);
 expect(rpc).not.toHaveBeenCalled();
});
test('requires an updated preview after a concurrent change',async()=>{
 rpc.mockResolvedValue({data:null,error:{code:'40001'}});
 const result=await POST(request(input));expect(result.status).toBe(409);expect(await result.json()).toEqual({error:'selection_changed'});
});
test('does not allow connected clients into first-party bulk flow',async()=>{
 authenticate.mockResolvedValue({principal:{authKind:'connected_client'},supabase:{rpc}});
 expect((await POST(request(input))).status).toBe(403);expect(rpc).not.toHaveBeenCalled();
});

test('accepts server-owned whole-filter selection with explicit exclusions',async()=>{
 rpc.mockResolvedValue({data:{articleCount:64,meaningCount:67,planId:group,audience:[]},error:null});
 const result=await POST(request({...input,all:true,groups:[group]}));expect(result.status).toBe(200);
 expect(rpc).toHaveBeenCalledWith('prepare_words_bulk_collection_v1',expect.objectContaining({p_all:true,p_groups:[group]}));
});

test('confirms the plan once and reads the same receipt separately',async()=>{
 const receipt={planId:group,collectionId:list,status:'committed',addedCount:2};rpc.mockResolvedValue({data:receipt,error:null});
 const confirm=new NextRequest('http://localhost/api/library/bulk-collection',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({planId:group})});
 expect(await (await PUT(confirm)).json()).toEqual(receipt);
 expect(rpc).toHaveBeenLastCalledWith('confirm_words_bulk_collection_v1',{p_plan_id:group});
 const read=new NextRequest(`http://localhost/api/library/bulk-collection?planId=${group}`);
 expect(await (await GET(read)).json()).toEqual(receipt);
 expect(rpc).toHaveBeenLastCalledWith('read_words_bulk_collection_plan_v1',{p_plan_id:group});
});
