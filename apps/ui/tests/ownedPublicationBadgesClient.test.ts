import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({headers:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:mock.headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:mock.fetch}));
import {readOwnedPublicationBadges} from '@/lib/collections/sharing/publicationBadgesClient';
import {parsePublicationBadgeRequest,parsePublicationBadges} from '@/lib/collections/sharing/publicationBadgesContract';
const user='75600000-0000-4000-8000-000000000001',id='75600000-0000-4000-8000-000000000002';
beforeEach(()=>{vi.resetAllMocks();mock.headers.mockResolvedValue({authorization:'Bearer test'});mock.fetch.mockResolvedValue(Response.json({openIds:[id]}));});
test('read-only POST returns only requested open IDs and checks the same account afterward',async()=>{
 expect(await readOwnedPublicationBadges(user,[id],new AbortController().signal)).toEqual([id]);expect(mock.headers).toHaveBeenCalledTimes(2);
 expect(mock.fetch).toHaveBeenCalledWith('/api/library/shared-collections/owned/badges',expect.objectContaining({method:'POST',cache:'no-store',credentials:'same-origin',body:JSON.stringify({ids:[id]})}));
});
test('account change and malformed answers cannot label a private row as published',async()=>{
 mock.headers.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('auth_account_changed'));
 await expect(readOwnedPublicationBadges(user,[id],new AbortController().signal)).rejects.toThrow('auth_account_changed');
 mock.fetch.mockResolvedValueOnce(Response.json({openIds:['75600000-0000-4000-8000-000000000003']}));
 await expect(readOwnedPublicationBadges(user,[id],new AbortController().signal)).rejects.toThrow('publication_badges_contract_invalid');
});
test('closed request and response guards reject duplicate, foreign or extra IDs',()=>{
 expect(parsePublicationBadgeRequest({ids:[id,id]})).toBeNull();expect(parsePublicationBadgeRequest({ids:[id],code:'secret'})).toBeNull();
 expect(parsePublicationBadges({openIds:['75600000-0000-4000-8000-000000000003']},[id])).toBeNull();
 expect(parsePublicationBadges({openIds:[id],secret:'hidden'},[id])).toBeNull();
});
