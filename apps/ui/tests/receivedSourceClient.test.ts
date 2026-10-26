import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({headers:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:mock.headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:mock.fetch}));
import {readReceivedSource} from '@/lib/collections/sharing/receivedSourceClient';
import {parseReceivedSource} from '@/lib/collections/sharing/receivedSourceContract';
const id='75600000-0000-4000-8000-000000000001',user='75600000-0000-4000-8000-000000000002';
beforeEach(()=>{vi.resetAllMocks();mock.headers.mockResolvedValue({authorization:'Bearer test'});mock.fetch.mockResolvedValue(Response.json({id,name:'Anna lesson',createdAt:'2026-01-01T00:00:00Z'}));});
test('checks account again after no-store point read',async()=>{expect(await readReceivedSource(user,id,new AbortController().signal)).toMatchObject({id,name:'Anna lesson'});expect(mock.headers).toHaveBeenCalledTimes(2);expect(mock.fetch).toHaveBeenCalledWith(expect.stringContaining(id),expect.objectContaining({cache:'no-store',credentials:'same-origin'}));});
test('lost grant and account switch never retain a caption',async()=>{
 mock.fetch.mockResolvedValueOnce(Response.json({error:'not_found'},{status:404}));expect(await readReceivedSource(user,id,new AbortController().signal)).toBeNull();
 mock.headers.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('auth_account_changed'));await expect(readReceivedSource(user,id,new AbortController().signal)).rejects.toThrow('auth_account_changed');
});
test('source parser rejects cross-source and extra secret fields',()=>{expect(parseReceivedSource({id,name:'Anna lesson',createdAt:'2026-01-01T00:00:00Z',code:'secret'},id)).toBeNull();expect(parseReceivedSource({id:'75600000-0000-4000-8000-000000000003',name:'Other',createdAt:'2026-01-01T00:00:00Z'},id)).toBeNull();});
