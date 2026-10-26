import {beforeEach,expect,test,vi} from 'vitest';
const transport=vi.hoisted(()=>({headers:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:transport.headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:transport.fetch}));
import {readEntryNoteMaterial} from '@/lib/platform/entryNoteMaterialClient';
const entryId='entry',note={noteId:'note',ownerUserId:'teacher',text:'Provided note',revision:'9007199254740993',isOwn:false};
beforeEach(()=>{vi.resetAllMocks();transport.headers.mockResolvedValue({authorization:'Bearer test'});transport.fetch.mockImplementation(()=>Promise.resolve(Response.json({entryId,notes:[note]})));});
test('reads exact note material uncached and checks the account again before returning text',async()=>{
 expect(await readEntryNoteMaterial('reader',entryId,new AbortController().signal)).toEqual([note]);
 expect(transport.headers).toHaveBeenCalledTimes(2);expect(transport.fetch).toHaveBeenCalledWith('/api/library/entries/entry/note-material',expect.objectContaining({cache:'no-store'}));
});
test('late account switch cannot deliver another account cached text',async()=>{
 transport.headers.mockResolvedValueOnce({authorization:'Bearer old'}).mockRejectedValueOnce(new Error('auth_account_changed'));
 await expect(readEntryNoteMaterial('reader',entryId,new AbortController().signal)).rejects.toThrow('auth_account_changed');
});
test('revoked material returns empty while other failures remain failed reads',async()=>{
 transport.fetch.mockResolvedValueOnce(new Response(null,{status:404}));expect(await readEntryNoteMaterial('reader',entryId,new AbortController().signal)).toEqual([]);
 transport.fetch.mockResolvedValueOnce(new Response(null,{status:503}));await expect(readEntryNoteMaterial('reader',entryId,new AbortController().signal)).rejects.toThrow('note_material_unavailable');
});
test('navigation abort cannot deliver late note text',async()=>{
 const controller=new AbortController();let release!:(value:Response)=>void;
 transport.fetch.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const pending=readEntryNoteMaterial('reader',entryId,controller.signal);
 await vi.waitFor(()=>expect(transport.fetch).toHaveBeenCalledOnce());controller.abort();release(Response.json({entryId,notes:[note]}));await expect(pending).rejects.toThrow('Aborted');
});
test('rejects unexpected or mismatched material instead of rendering it',async()=>{
 transport.fetch.mockResolvedValueOnce(Response.json({entryId:'other-entry',notes:[note]}));await expect(readEntryNoteMaterial('reader',entryId,new AbortController().signal)).rejects.toThrow('note_material_contract_invalid');
});
