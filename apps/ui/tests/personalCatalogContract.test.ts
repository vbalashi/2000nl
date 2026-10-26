import {expect,test} from 'vitest';
import {parsePersonalCatalogPage,parsePersonalCatalogQuery} from '@/lib/collections/sharing/personalCatalogContract';
const id='75600000-0000-4000-8000-000000000001';
const row={id,name:'Lesson',createdAt:'2026-01-01T00:00:00Z',ownership:'received',isShared:true,itemCount:3,labelIds:[]};
test('unified catalog keeps query and resource type closed',()=>{
 expect(parsePersonalCatalogQuery({query:'%',scope:'all',languageCode:'nl'})).toMatchObject({query:'%',languageCode:'nl'});
 expect(parsePersonalCatalogQuery({scope:'label',labelId:null})).toBeNull();expect(parsePersonalCatalogQuery({languageCode:'nl',userId:id})).toBeNull();
 expect(parsePersonalCatalogPage({revision:1,collections:[row],nextCursor:null},50)?.collections[0].ownership).toBe('received');
 for(const value of [{...row,isShared:false},{...row,invitationCode:'secret'},{...row,labelIds:[id,id]}])expect(parsePersonalCatalogPage({revision:1,collections:[value],nextCursor:null},50)).toBeNull();
});
