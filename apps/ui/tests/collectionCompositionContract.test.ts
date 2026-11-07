import {test,expect} from 'vitest';
import {parseCollectionCompositionOperation} from '@/lib/collections/sharing/collectionCompositionContract';
const id='11111111-1111-4111-8111-111111111111';
test('composition operations are bounded and cannot select an owner',()=>{
 expect(parseCollectionCompositionOperation({action:'remove',entryIds:[id,id]})).toEqual({action:'remove',entryIds:[id]});
 expect(parseCollectionCompositionOperation({action:'delete',userId:id})).toBeNull();
 expect(parseCollectionCompositionOperation({action:'remove',entryIds:[]})).toBeNull();
 expect(parseCollectionCompositionOperation({action:'add',entryId:'invalid'})).toBeNull();
});

test('composition preview cannot switch target or action',async()=>{
 const {parseCollectionCompositionPlan}=await import('@/lib/collections/sharing/collectionCompositionContract');
 const plan={planId:id,collectionId:id,action:'delete',audience:[]};
 expect(parseCollectionCompositionPlan(plan,id,'delete')).toEqual(plan);
 expect(parseCollectionCompositionPlan(plan,id,'add')).toBeNull();
 expect(parseCollectionCompositionPlan({...plan,privatePlan:{}},id,'delete')).toBeNull();
});
