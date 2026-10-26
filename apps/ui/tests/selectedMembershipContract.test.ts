import {expect,test} from 'vitest';
import {parseSelectedMembership} from '@/lib/collections/sharing/selectedMembershipContract';
const id='75600000-0000-4000-8000-000000000001',entry='75600000-0000-4000-8000-000000000002';
test('correlates collection and requested meanings without accepting unsolicited IDs',()=>{
 expect(parseSelectedMembership({collectionId:id,includedEntryIds:[entry]},id,[entry])).toEqual([entry]);
 for(const value of [null,{collectionId:entry,includedEntryIds:[]},{collectionId:id,includedEntryIds:[id]},{collectionId:id,includedEntryIds:[entry,entry]},{collectionId:id,includedEntryIds:[],extra:true}])expect(parseSelectedMembership(value,id,[entry])).toBeNull();
});
