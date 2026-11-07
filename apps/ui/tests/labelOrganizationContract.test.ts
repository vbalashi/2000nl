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

test('receipt binds the plan and rejects payload on pending status',async()=>{
 const {parseLabelOrganizationReceipt}=await import('@/lib/collections/sharing/labelOrganizationContract');
 expect(parseLabelOrganizationReceipt({planId:id,status:'pending'},id)).toEqual({planId:id,status:'pending'});
 expect(parseLabelOrganizationReceipt({planId:id,status:'pending',result:{}},id)).toBeNull();
 expect(parseLabelOrganizationReceipt({planId:id,status:'committed',result:{revision:1,labels:[],assignments:[]}},id)?.status).toBe('committed');
});
