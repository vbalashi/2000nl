import {test,expect} from 'vitest';
import {parseLabelOrganizationPlan} from '@/lib/collections/sharing/labelOrganizationContract';
const id='11111111-1111-4111-8111-111111111111';
test('audience plans require exact, unique server projection',()=>{
 const pair={userId:id,collectionId:id};
 const plan={planId:id,audienceRevision:'a'.repeat(64),delta:{added:[pair],removed:[],pathsChanged:true},copyRequired:false};
 expect(parseLabelOrganizationPlan(plan)).toEqual(plan);
 expect(parseLabelOrganizationPlan({...plan,operation:{}})).toBeNull();
 expect(parseLabelOrganizationPlan({...plan,delta:{...plan.delta,added:[pair,pair]}})).toBeNull();
});
