import {test,expect} from 'vitest';
import {parseLabelShareState,parseLabelSharePreview} from '@/lib/collections/sharing/labelSharingContract';
const labelId='11111111-1111-4111-8111-111111111111';
test('rejects inconsistent invitation and management projections',()=>{
 const state={labelId,isOpen:false,revision:0,invitationCode:null,subscriberCount:0};
 expect(parseLabelShareState(state)).toEqual(state);
 expect(parseLabelShareState({...state,isOpen:true})).toBeNull();
 expect(parseLabelShareState({...state,privateData:true})).toBeNull();
 const preview={labelId,name:'YouTube',collectionCount:2,alreadyAdded:false,role:null};
 expect(parseLabelSharePreview(preview)).toEqual(preview);
 expect(parseLabelSharePreview({...preview,role:'viewer'})).toBeNull();
});

test('catalog refuses duplicate identities and private data',async()=>{
 const {parseLabelSharingCatalog}=await import('@/lib/collections/sharing/labelSharingContract');
 const row={labelId,name:'group',collectionCount:0};
 expect(parseLabelSharingCatalog({owned:[],received:[row]})).toEqual({owned:[],received:[row]});
 expect(parseLabelSharingCatalog({owned:[],received:[row,row]})).toBeNull();
 expect(parseLabelSharingCatalog({owned:[],received:[{...row,invitationCode:'secret'}]})).toBeNull();
});

test('commands bind mutations to a revision and reject collection identities',async()=>{
 const {parseLabelShareCommand}=await import('@/lib/collections/sharing/labelSharingContract');
 const command={operationId:labelId,action:'open',labelId,expectedRevision:0};
 expect(parseLabelShareCommand(command)).toEqual(command);
 expect(parseLabelShareCommand({...command,expectedRevision:undefined})).toBeNull();
 expect(parseLabelShareCommand({...command,collectionId:labelId})).toBeNull();
});

test('receipt must match original operation and resource',async()=>{
 const {parseLabelShareReceipt}=await import('@/lib/collections/sharing/labelSharingContract');
 const command={operationId:labelId,action:'close' as const,labelId,expectedRevision:1};
 const receipt={operationId:labelId,status:'committed',action:'close',result:{labelId,isOpen:false,revision:2,invitationCode:null,subscriberCount:0}};
 expect(parseLabelShareReceipt(receipt,command)).toEqual(receipt);
 expect(parseLabelShareReceipt({...receipt,action:'open'},command)).toBeNull();
 expect(parseLabelShareReceipt({...receipt,result:{...receipt.result,labelId:'22222222-2222-4222-8222-222222222222'}},command)).toBeNull();
});

test('group page cursor must identify its final unique collection',async()=>{
 const {parseLabelShareCollectionsPage}=await import('@/lib/collections/sharing/labelSharingContract');
 const page={labelId,collections:[{collectionId:labelId,name:'lesson'}],nextCursor:labelId};
 expect(parseLabelShareCollectionsPage(page)).toEqual(page);
 expect(parseLabelShareCollectionsPage({...page,collections:[...page.collections,...page.collections]})).toBeNull();
 expect(parseLabelShareCollectionsPage({...page,nextCursor:'22222222-2222-4222-8222-222222222222'})).toBeNull();
});
