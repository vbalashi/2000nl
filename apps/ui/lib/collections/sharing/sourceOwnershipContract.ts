export type SourceOwnership='all'|'owned'|'received';
export function parseSourceOwnership(value:unknown):SourceOwnership|null{
 return value===undefined?'all':value==='all'||value==='owned'||value==='received'?value:null;
}
