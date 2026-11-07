import {beforeEach,test,expect,vi} from 'vitest';
const {headers,fetcher}=vi.hoisted(()=>({headers:vi.fn(),fetcher:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:fetcher}));
import {confirmLabelOrganization} from '@/lib/collections/sharing/labelOrganizationClient';
const id='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{vi.clearAllMocks();headers.mockResolvedValue({});});
test('confirmation retains the plan identity across retry after transport failure',async()=>{
 fetcher.mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(Response.json({revision:1,labels:[],assignments:[]}));
 await expect(confirmLabelOrganization(id,id,new AbortController().signal)).rejects.toThrow('offline');
 expect(await confirmLabelOrganization(id,id,new AbortController().signal)).toEqual({revision:1,labels:[],assignments:[]});
 expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({planId:id});
 expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
});
test('audience conflicts are actionable errors',async()=>{
 fetcher.mockResolvedValue(Response.json({error:'label_audience_changed'},{status:409}));
 await expect(confirmLabelOrganization(id,id,new AbortController().signal)).rejects.toThrow('label_audience_changed');
});

test('receipt lookup is a GET and never confirms a pending plan',async()=>{
 const {readLabelOrganizationReceipt}=await import('@/lib/collections/sharing/labelOrganizationClient');
 fetcher.mockResolvedValue(Response.json({planId:id,status:'pending'}));
 expect(await readLabelOrganizationReceipt(id,id,new AbortController().signal)).toEqual({planId:id,status:'pending'});
 expect(fetcher.mock.calls[0][1].method).toBe('GET');
 expect(fetcher.mock.calls[0][1].body).toBeUndefined();
});
