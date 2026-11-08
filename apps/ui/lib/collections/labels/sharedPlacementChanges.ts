import {
  collectionsForLabel,
  type CollectionLabelOperation,
  type CollectionLabelsSnapshot,
} from './model';

export type SharedPlacementRoot = {labelId:string;name:string;isOpen:boolean};
export type SharedPlacementChange = {
  labelId:string;
  name:string;
  addedCollectionIds:string[];
  removedCollectionIds:string[];
};

/**
 * Explain group placement changes against the operation's original snapshot.
 * This is not an access decision: the prepared server plan and its audience
 * checks remain authoritative, including independent paths through other groups.
 */
export function sharedPlacementChanges(
  snapshot:CollectionLabelsSnapshot,
  operation:CollectionLabelOperation,
  roots:readonly SharedPlacementRoot[],
  ownedCollectionIds:readonly string[],
):SharedPlacementChange[] {
  // A new empty label has no assignments and cannot change a group's contents.
  if(operation.type==='create')return [];
  let next:CollectionLabelsSnapshot;
  if(operation.type==='set-collection-labels'){
    next={...snapshot,assignments:[
      ...snapshot.assignments.filter(item=>item.collection_id!==operation.collection_id),
      ...operation.label_ids.map(label_id=>({collection_id:operation.collection_id,label_id})),
    ]};
  }else{
    const existing=snapshot.labels.find(label=>label.id===operation.id);
    if(!existing)return [];
    if(operation.type==='update'){
      // Name and description changes leave subtree membership intact.
      const parentId=operation.parent_id;
      if(parentId===undefined||parentId===existing.parent_id)return [];
      next={...snapshot,labels:snapshot.labels.map(label=>label.id===operation.id?{...label,parent_id:parentId}:label)};
    }else{
      // The database splices children up one level; descendants keep assignments.
      next={...snapshot,
        labels:snapshot.labels.filter(label=>label.id!==operation.id).map(label=>label.parent_id===operation.id?{...label,parent_id:existing.parent_id}:label),
        assignments:snapshot.assignments.filter(item=>item.label_id!==operation.id),
      };
    }
  }
  const owned=new Set(ownedCollectionIds);
  const groups:SharedPlacementChange[]=[];
  const visited=new Set<string>();
  for(const root of roots){
    if(!root.isOpen||visited.has(root.labelId))continue;
    visited.add(root.labelId);
    const before=new Set(collectionsForLabel(snapshot,root.labelId).filter(id=>owned.has(id)));
    const after=new Set(collectionsForLabel(next,root.labelId).filter(id=>owned.has(id)));
    const addedCollectionIds=[...after].filter(id=>!before.has(id));
    const removedCollectionIds=[...before].filter(id=>!after.has(id));
    if(addedCollectionIds.length||removedCollectionIds.length)groups.push({labelId:root.labelId,name:root.name,addedCollectionIds,removedCollectionIds});
  }
  return groups;
}
