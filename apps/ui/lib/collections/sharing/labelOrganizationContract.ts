import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
export type AudiencePair={userId:string;collectionId:string};
export type LabelOrganizationPlan={planId:string;audienceRevision:string;delta:{added:AudiencePair[];removed:AudiencePair[];pathsChanged:boolean};copyRequired:boolean};
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,fields:string[])=>Object.keys(v).length===fields.length&&Object.keys(v).every(key=>fields.includes(key));
function pairs(v:unknown):v is AudiencePair[]{
 if(!Array.isArray(v))return false;
 const seen=new Set<string>();
 for(const pair of v){
  if(!object(pair)||!keys(pair,['userId','collectionId'])||!copyUuid(pair.userId)||!copyUuid(pair.collectionId))return false;
  const identity=`${pair.userId.toLowerCase()}:${pair.collectionId.toLowerCase()}`;
  if(seen.has(identity))return false;seen.add(identity);
 }
 return true;
}
export function parseLabelOrganizationPlan(v:unknown):LabelOrganizationPlan|null{
 if(!object(v)||!keys(v,['planId','audienceRevision','delta','copyRequired'])||!copyUuid(v.planId)||typeof v.audienceRevision!=='string'||!/^[0-9a-f]{64}$/.test(v.audienceRevision)||typeof v.copyRequired!=='boolean'||!object(v.delta)||!keys(v.delta,['added','removed','pathsChanged'])||typeof v.delta.pathsChanged!=='boolean'||!pairs(v.delta.added)||!pairs(v.delta.removed))return null;
 return v as LabelOrganizationPlan;
}
