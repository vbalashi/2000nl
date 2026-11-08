import {beforeEach,test,expect,vi} from 'vitest';
const {headers,fetcher,auth,rpc}=vi.hoisted(()=>({headers:vi.fn(),fetcher:vi.fn(),auth:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:fetcher}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:auth,requirePlatformScope:()=>null,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}})}));
import {NextRequest} from 'next/server';
import {readOwnedCollectionAccessMetadata} from '@/lib/collections/sharing/ownedAccessMetadataClient';
import {normalizeOwnedCollectionIds,parseOwnedCollectionAccessMetadata} from '@/lib/collections/sharing/ownedCollectionAccessContract';
import {POST} from '@/app/api/library/label-sharing/owned-access/route';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const data={collections:[{collectionId:id,isShared:true,subscriberCount:0}]};
const request=(body:unknown)=>new NextRequest('http://localhost/api/library/label-sharing/owned-access',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();headers.mockResolvedValue({});auth.mockResolvedValue({principal:{authKind:'first_party'},supabase:{rpc}});rpc.mockReturnValue({abortSignal:async()=>({data,error:null})});fetcher.mockResolvedValue(Response.json(data));});
test('batch parser is bounded, request-bound and exposes only aggregates',()=>{
 expect(normalizeOwnedCollectionIds(Array(201).fill(id))).toBeNull();expect(normalizeOwnedCollectionIds([id,id])).toEqual([id]);expect(parseOwnedCollectionAccessMetadata(data,[id])).toEqual(data);
 for(const value of [{collections:[...data.collections,...data.collections]},{collections:[{collectionId:other,isShared:true,subscriberCount:1}]},{collections:[{...data.collections[0],userIds:[id]}]},{collections:[{collectionId:id,isShared:false,subscriberCount:1}]}])expect(parseOwnedCollectionAccessMetadata(value,[id])).toBeNull();
});
test('client returns rows in one read batch and rejects account changes',async()=>{
 expect(await readOwnedCollectionAccessMetadata(id,[id,id],new AbortController().signal)).toEqual(data.collections);expect(fetcher).toHaveBeenCalledTimes(1);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({collectionIds:[id]});
 headers.mockResolvedValueOnce({}).mockRejectedValueOnce(Error('account changed'));fetcher.mockResolvedValueOnce(Response.json(data));await expect(readOwnedCollectionAccessMetadata(id,[id],new AbortController().signal)).rejects.toThrow('account changed');
});
test('invalid and aborted client calls never fetch',async()=>{
 await expect(readOwnedCollectionAccessMetadata(id,Array(201).fill(id),new AbortController().signal)).rejects.toThrow('invalid_share_request');const controller=new AbortController();controller.abort();await expect(readOwnedCollectionAccessMetadata(id,[id],controller.signal)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
});
test('route bounds first-party bodies and calls only a read RPC',async()=>{
 const response=await POST(request({collectionIds:[id,id]}));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toEqual(data);expect(rpc).toHaveBeenCalledWith('read_owned_collection_access_metadata_v1',{p_collection_ids:[id]});
 rpc.mockClear();for(const body of [{collectionIds:[id],userId:id},{collectionIds:Array(201).fill(id)}])expect((await POST(request(body))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();auth.mockResolvedValue({principal:{authKind:'connected_client'}});expect((await POST(request({collectionIds:[id]}))).status).toBe(403);
});
test('route rejects server IDs outside the requested batch',async()=>{
 rpc.mockReturnValue({abortSignal:async()=>({data:{collections:[{...data.collections[0],collectionId:other}]},error:null})});expect((await POST(request({collectionIds:[id]}))).status).toBe(502);
});
