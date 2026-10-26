import {expect,test,vi} from 'vitest';
import {inspectLocalRecord,clearCorruptLocalRecord} from '@/lib/collections/sharing/corruptLocalRecord';
test('explicit cleanup is compare-and-clear and never removes a valid or replaced intent',()=>{
 const values=new Map([['key','broken']]),store={getItem:(k:string)=>values.get(k)??null,removeItem:(k:string)=>{values.delete(k);}};
 expect(inspectLocalRecord(store,'key',()=>false)).toEqual({kind:'corrupt',snapshot:'broken'});
 values.set('key','new-intent');expect(clearCorruptLocalRecord(store,'key','broken',()=>false)).toBe(false);expect(values.has('key')).toBe(true);
 expect(clearCorruptLocalRecord(store,'key','new-intent',()=>true)).toBe(false);expect(values.has('key')).toBe(true);
 expect(clearCorruptLocalRecord(store,'key','new-intent',()=>false)).toBe(true);expect(inspectLocalRecord(store,'key',()=>false)).toEqual({kind:'empty'});
});
test('denied storage and failed cleanup remain unavailable, without pretending repair',()=>{
 const store={getItem:vi.fn(()=>{throw Error('denied');}),removeItem:vi.fn()};expect(inspectLocalRecord(store,'key',()=>false)).toEqual({kind:'unavailable'});expect(clearCorruptLocalRecord(store,'key','broken',()=>false)).toBe(false);expect(store.removeItem).not.toHaveBeenCalled();
 const retained={getItem:()=> 'broken',removeItem:vi.fn()};expect(clearCorruptLocalRecord(retained,'key','broken',()=>false)).toBe(false);
});
