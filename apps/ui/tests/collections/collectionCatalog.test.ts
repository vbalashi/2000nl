import {expect,test} from "vitest";
import {collectionRows,labelRows} from "@/lib/collections/labels/catalog";
import type {CollectionLabelsSnapshot} from "@/lib/collections/labels/model";
const snapshot:CollectionLabelsSnapshot={revision:0,labels:[{id:"root",parent_id:null,name:"YouTube",description:null,created_at:"",updated_at:""},{id:"child",parent_id:"root",name:"Lesson",description:null,created_at:"",updated_at:""}],assignments:[{collection_id:"999",label_id:"child"},{collection_id:"999",label_id:"root"}]};
const collections=Array.from({length:1000},(_,i)=>({id:String(i),name:`Lesson ${String(i).padStart(4,"0")}`,type:"user" as const}));
test("search covers the entire bounded catalog before UI paging and label overlap deduplicates",()=>{
 expect(collectionRows(snapshot,collections,"all","0999","name","en").map(item=>item.id)).toEqual(["999"]);
 expect(collectionRows(snapshot,[...collections,collections[999]],"root","","recent","en").map(item=>item.id)).toEqual(["999"]);
 expect(collectionRows(snapshot,collections,"unlabelled","","name","en")).toHaveLength(999);
});
test("label search has full ancestor context even when names repeat",()=>{
 expect(labelRows(snapshot,"en").map(item=>({depth:item.depth,path:item.path}))).toEqual([{depth:0,path:"YouTube"},{depth:1,path:"YouTube / Lesson"}]);
});
