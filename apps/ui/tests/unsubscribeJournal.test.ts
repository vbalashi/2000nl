import {beforeEach,expect,test,vi} from 'vitest';
import {createShareIntent} from '@/lib/collections/sharing/shareCommandClient';
import {readUnsubscribeJournal,retainUnsubscribeJournal,clearUnsubscribeJournal} from '@/lib/collections/sharing/unsubscribeJournal';
const collectionId='75600000-0000-4000-8000-000000000001',operationId='75600000-0000-4000-8000-000000000002';
const intent=createShareIntent('reader',{operationId,action:'unsubscribe',collectionId});
let data:Map<string,string>;const store={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};
beforeEach(()=>{data=new Map();});
test('retains canonical account-bound intent across reconstruction, without article or invitation text',()=>{
 expect(retainUnsubscribeJournal(store,intent)).toBe(true);expect(readUnsubscribeJournal(store,'reader')).toEqual(intent);expect(readUnsubscribeJournal(store,'other')).toBeNull();expect([...data.values()][0]).toBe(JSON.stringify(intent));
});
test('a second unresolved operation cannot overwrite the journal or be removed by a stale completion',()=>{
 retainUnsubscribeJournal(store,intent);const other=createShareIntent('reader',{...intent.command,operationId:collectionId});expect(retainUnsubscribeJournal(store,other)).toBe(false);clearUnsubscribeJournal(store,other);expect(readUnsubscribeJournal(store,'reader')).toEqual(intent);clearUnsubscribeJournal(store,intent);expect(data.size).toBe(0);
});
test('denied storage prevents write admission instead of claiming durability',()=>{
 expect(retainUnsubscribeJournal({...store,setItem:vi.fn(()=>{throw new Error('denied');})},intent)).toBe(false);expect(data.size).toBe(0);
});
test.each(['null','{','{}'])('corrupt journal does not become a fresh operation: %s',raw=>{
 retainUnsubscribeJournal(store,intent);data.set([...data.keys()][0],raw);expect(readUnsubscribeJournal(store,'reader')).toBeNull();expect(retainUnsubscribeJournal(store,intent)).toBe(false);
});
