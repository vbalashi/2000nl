import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({headers:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:mock.headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:mock.fetch}));
import {writeReceivedLabels} from '@/lib/collections/sharing/receivedLabelsClient';
const id='75600000-0000-4000-8000-000000000001',label='75600000-0000-4000-8000-000000000002';
beforeEach(()=>{vi.resetAllMocks();mock.headers.mockResolvedValue({});mock.fetch.mockResolvedValue(Response.json({collectionId:id,revision:4,labelIds:[label]}));});
test('replacement verifies the same account and desired set after write',async()=>{
 expect(await writeReceivedLabels('reader',id,{expectedRevision:3,labelIds:[label]},new AbortController().signal)).toMatchObject({revision:4});expect(mock.headers).toHaveBeenCalledTimes(2);
 mock.fetch.mockResolvedValueOnce(Response.json({collectionId:id,revision:4,labelIds:[]}));await expect(writeReceivedLabels('reader',id,{expectedRevision:3,labelIds:[label]},new AbortController().signal)).rejects.toThrow('unavailable');
});
test('late response after account switch cannot confirm a previous account change',async()=>{
 mock.headers.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('auth_account_changed'));await expect(writeReceivedLabels('reader',id,{expectedRevision:3,labelIds:[label]},new AbortController().signal)).rejects.toThrow('auth_account_changed');
});
