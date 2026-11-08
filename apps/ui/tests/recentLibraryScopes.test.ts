import {expect,test} from 'vitest';
import {parseRecentLibraryScopes,recentLibraryScopeKey,rememberLibraryScope,type RecentLibraryScope} from '@/components/training/wordlist/recentLibraryScopes';
const scope=(query:string):RecentLibraryScope=>({query,languageCode:'nl',dictionaryId:null,collectionId:null,collectionOwnership:null,labelId:null,labelName:null,sourceName:'All dictionaries',filters:{parts:[],article:null},category:'headwords'});
test('word searches share one filter record and never evict distinct filter settings',()=>{
 let items:RecentLibraryScope[]=[];for(let i=0;i<6;i++)items=rememberLibraryScope(items,{...scope(''),dictionaryId:String(i)});
 for(let i=0;i<50;i++)items=rememberLibraryScope(items,{...scope(String(i)),dictionaryId:'5'});
 expect(items.map(x=>x.dictionaryId)).toEqual(['5','4','3','2','1','0']);
 expect(items.every(x=>x.query===''&&x.category==='headwords')).toBe(true);
 expect(recentLibraryScopeKey(scope('huis'))).toBe(recentLibraryScopeKey(scope('bank')));
});
test('migrates old word history into unique filter-only records',()=>{
 const items=parseRecentLibraryScopes(JSON.stringify([scope('huis'),scope('bank'),{...scope('fiets'),dictionaryId:'other'}]));
 expect(items.map(x=>[x.query,x.dictionaryId])).toEqual([['',null],['','other']]);
});
test('ignores corrupted or incompatible stored records',()=>{
 expect(parseRecentLibraryScopes('{')).toEqual([]);
 expect(parseRecentLibraryScopes(JSON.stringify([{...scope('ok'),filters:{parts:['invented'],article:null}},scope('valid')])).map(x=>x.query)).toEqual(['']);
});
