import {beforeEach,expect,test} from 'vitest';
import {createShareIntent} from '@/lib/collections/sharing/shareCommandClient';
import {readAcceptJournal,retainAcceptJournal,clearAcceptJournal} from '@/lib/collections/sharing/acceptJournal';
const operationId='75600000-0000-4000-8000-000000000001',code='A'.repeat(26);
beforeEach(()=>window.sessionStorage.clear());
test('retains the complete original accept hash input, scoped to account, with no preview material',()=>{
 const intent=createShareIntent('reader',{operationId,action:'accept',code});expect(retainAcceptJournal(window.sessionStorage,intent)).toBe(true);expect(readAcceptJournal(window.sessionStorage,'reader')).toEqual(intent);expect(readAcceptJournal(window.sessionStorage,'other')).toBeNull();
 const stored=window.sessionStorage.getItem(window.sessionStorage.key(0)!);expect(stored).toBe(JSON.stringify(intent));clearAcceptJournal(window.sessionStorage,intent);expect(window.sessionStorage.length).toBe(0);
});
test('does not replace an unresolved invitation with another code under the same nonce',()=>{
 const intent=createShareIntent('reader',{operationId,action:'accept',code});retainAcceptJournal(window.sessionStorage,intent);
 expect(retainAcceptJournal(window.sessionStorage,createShareIntent('reader',{operationId,action:'accept',code:'B'.repeat(26)}))).toBe(false);
});
