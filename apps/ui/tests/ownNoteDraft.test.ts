import {beforeEach,expect,test,vi} from 'vitest';
import {retainOwnNoteDraft,readOwnNoteDraft,clearOwnNoteDraft,type OwnNoteDraft} from '@/lib/collections/sharing/ownNoteDraft';
const id='75600000-0000-4000-8000-000000000001';
const draft:OwnNoteDraft={userId:'reader',entryId:id,revision:'9007199254740993',baseNotes:'Previous',draft:'Private draft',sent:false};
beforeEach(()=>window.sessionStorage.clear());
test('draft text and precise clock are scoped to both principal and entry',()=>{
 expect(retainOwnNoteDraft(window.sessionStorage,draft)).toBe(true);expect(readOwnNoteDraft(window.sessionStorage,'reader',id)).toEqual(draft);expect(readOwnNoteDraft(window.sessionStorage,'other',id)).toBeNull();expect(readOwnNoteDraft(window.sessionStorage,'reader','75600000-0000-4000-8000-000000000002')).toBeNull();
});
test('unresolved write cannot be overwritten and stale cleanup cannot erase a newer draft',()=>{
 const sent={...draft,sent:true};retainOwnNoteDraft(window.sessionStorage,sent);expect(retainOwnNoteDraft(window.sessionStorage,{...draft,draft:'New'})).toBe(false);clearOwnNoteDraft(window.sessionStorage,draft);expect(readOwnNoteDraft(window.sessionStorage,'reader',id)).toEqual(sent);
});
test('explicitly settled replacement does not delete recovery data before a failed write',()=>{
 const sent={...draft,sent:true};retainOwnNoteDraft(window.sessionStorage,sent);const deny=vi.spyOn(Object.getPrototypeOf(window.sessionStorage),'setItem').mockImplementation(()=>{throw new Error('quota');});
 try{expect(retainOwnNoteDraft(window.sessionStorage,{...draft,draft:'New'},sent)).toBe(false);expect(readOwnNoteDraft(window.sessionStorage,'reader',id)).toEqual(sent);}finally{deny.mockRestore();}
});
test('corrupt prior recovery data cannot silently be overwritten by a new save',()=>{
 retainOwnNoteDraft(window.sessionStorage,draft);const key=window.sessionStorage.key(0)!;window.sessionStorage.setItem(key,'{broken');expect(retainOwnNoteDraft(window.sessionStorage,{...draft,sent:true})).toBe(false);expect(window.sessionStorage.getItem(key)).toBe('{broken');
});
