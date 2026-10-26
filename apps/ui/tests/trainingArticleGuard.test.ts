import {expect,test} from 'vitest';
import {trainingArticleProtection} from '@/components/training/library-v2/trainingArticleGuard';
const guard={entryId:'active',headwordGroupId:'word'};
test('the original training entry stays protected independently of article selection',()=>{
 expect(trainingArticleProtection(guard,'active','word')).toEqual({active:true,headword:true});
 expect(trainingArticleProtection(guard,'sibling','word')).toEqual({active:false,headword:true});
 expect(trainingArticleProtection(guard,'unrelated','other')).toEqual({active:false,headword:false});
 expect(trainingArticleProtection(undefined,'active','word')).toEqual({active:false,headword:false});
 expect(trainingArticleProtection({...guard,headwordGroupId:null},'sibling','word')).toEqual({active:false,headword:true});
});
