import {expect,test} from 'vitest';
import {sharedPlacementChanges} from '@/lib/collections/labels/sharedPlacementChanges';
import type {CollectionLabelsSnapshot} from '@/lib/collections/labels/model';

const label=(id:string,parent_id:string|null=null)=>({id,parent_id,name:id,description:null,created_at:'',updated_at:''});
const roots=[{labelId:'youtube',name:'YouTube',isOpen:true},{labelId:'books',name:'Books',isOpen:true}];
const base:CollectionLabelsSnapshot={revision:7,labels:[label('youtube'),label('easy','youtube'),label('lubach','youtube'),label('deep','easy'),label('books'),label('private')],assignments:[]};
const assigned=(...rows:[string,string][]):CollectionLabelsSnapshot=>({...base,assignments:rows.map(([collection_id,label_id])=>({collection_id,label_id}))});

test('assigning a descendant reports its named shared ancestor once and excludes received collections',()=>{
 expect(sharedPlacementChanges(base,{type:'set-collection-labels',collection_id:'mine',label_ids:['easy','deep']},[...roots,roots[0]],['mine'])).toEqual([{labelId:'youtube',name:'YouTube',addedCollectionIds:['mine'],removedCollectionIds:[]}]);
 expect(sharedPlacementChanges(base,{type:'set-collection-labels',collection_id:'received',label_ids:['easy']},roots,['mine'])).toEqual([]);
 expect(base.assignments).toEqual([]);
});

test('an alternate descendant or direct ancestor assignment retains membership within a group',()=>{
 const snapshot=assigned(['mine','easy'],['mine','lubach']);
 for(const label_ids of [['lubach'],['youtube'],['deep']])expect(sharedPlacementChanges(snapshot,{type:'set-collection-labels',collection_id:'mine',label_ids},roots,['mine'])).toEqual([]);
 expect(sharedPlacementChanges(snapshot,{type:'set-collection-labels',collection_id:'mine',label_ids:['private']},roots,['mine'])).toEqual([{labelId:'youtube',name:'YouTube',addedCollectionIds:[],removedCollectionIds:['mine']}]);
});

test('moving between two groups names each placement change without claiming global access loss',()=>{
 expect(sharedPlacementChanges(assigned(['mine','easy']),{type:'set-collection-labels',collection_id:'mine',label_ids:['books']},roots,['mine'])).toEqual([
  {labelId:'youtube',name:'YouTube',addedCollectionIds:[],removedCollectionIds:['mine']},
  {labelId:'books',name:'Books',addedCollectionIds:['mine'],removedCollectionIds:[]},
 ]);
});

test('reparenting moves owned descendant contents, but alternate labels preserve the old group',()=>{
 const snapshot=assigned(['moving','deep'],['retained','deep'],['retained','lubach'],['received','deep']);
 expect(sharedPlacementChanges(snapshot,{type:'update',id:'easy',parent_id:'books'},roots,['moving','retained'])).toEqual([
  {labelId:'youtube',name:'YouTube',addedCollectionIds:[],removedCollectionIds:['moving']},
  {labelId:'books',name:'Books',addedCollectionIds:['moving','retained'],removedCollectionIds:[]},
 ]);
 expect(snapshot.labels.find(label=>label.id==='easy')?.parent_id).toBe('youtube');
});

test('deleting an intermediate label splices children and removes only direct assignments',()=>{
 const snapshot=assigned(['direct','easy'],['descendant','deep'],['both','easy'],['both','deep']);
 expect(sharedPlacementChanges(snapshot,{type:'delete',id:'easy'},roots,['direct','descendant','both'])).toEqual([{labelId:'youtube',name:'YouTube',addedCollectionIds:[],removedCollectionIds:['direct']}]);
});

test('deleting a shared root removes its group contents while another shared descendant keeps its own group',()=>{
 const snapshot=assigned(['mine','deep']);
 expect(sharedPlacementChanges(snapshot,{type:'delete',id:'youtube'},[...roots,{labelId:'easy',name:'Easy Dutch',isOpen:true}],['mine'])).toEqual([{labelId:'youtube',name:'YouTube',addedCollectionIds:[],removedCollectionIds:['mine']}]);
});

test('closed groups, empty creation and non-placement edits have no presentation delta',()=>{
 const snapshot=assigned(['mine','easy']);
 expect(sharedPlacementChanges(snapshot,{type:'set-collection-labels',collection_id:'mine',label_ids:[]},[{...roots[0],isOpen:false}],['mine'])).toEqual([]);
 expect(sharedPlacementChanges(snapshot,{type:'create',id:'new',name:'New',parent_id:'youtube'},roots,['mine'])).toEqual([]);
 expect(sharedPlacementChanges(snapshot,{type:'update',id:'easy',name:'Renamed'},roots,['mine'])).toEqual([]);
 expect(sharedPlacementChanges(snapshot,{type:'update',id:'easy',parent_id:'youtube'},roots,['mine'])).toEqual([]);
});
