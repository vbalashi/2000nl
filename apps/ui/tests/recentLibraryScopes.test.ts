import {expect,test} from 'vitest';
import {parseRecentLibraryScopes,recentLibraryScopeKey,rememberLibraryScope,type RecentLibraryScope} from '@/components/training/wordlist/recentLibraryScopes';
const scope=(query:string):RecentLibraryScope=>({query,languageCode:'nl',dictionaryId:null,collectionId:null,collectionOwnership:null,labelId:null,labelName:null,sourceName:'All dictionaries',filters:{parts:[],article:null},category:'headwords'});
test('retains the five previous scopes plus the current one, deduplicating an applied search',()=>{
 let items:RecentLibraryScope[]=[];for(let i=0;i<7;i++)items=rememberLibraryScope(items,scope(String(i)));
 expect(items.map(x=>x.query)).toEqual(['6','5','4','3','2','1']);
 items=rememberLibraryScope(items,scope('3'));expect(items.map(x=>x.query)).toEqual(['3','6','5','4','2','1']);
 expect(recentLibraryScopeKey({...scope('3'),sourceName:'Renamed'})).toBe(recentLibraryScopeKey(scope('3')));
});
test('ignores corrupted or incompatible stored records',()=>{
 expect(parseRecentLibraryScopes('{')).toEqual([]);
 expect(parseRecentLibraryScopes(JSON.stringify([{...scope('ok'),filters:{parts:['invented'],article:null}},scope('valid')])).map(x=>x.query)).toEqual(['valid']);
});
