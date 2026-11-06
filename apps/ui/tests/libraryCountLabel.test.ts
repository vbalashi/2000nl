import {expect,test} from 'vitest';
import {formatLibraryCounts} from '@/lib/platform/libraryCountLabel';
test.each([
 ['en',73,191,'73 articles · 191 meanings'],['en',73,115,'73 articles · 115 meanings'],
 ['en',1,1,'1 article · 1 meaning'],['en',0,0,'0 articles · 0 meanings'],
 ['ru',73,115,'73 статьи · 115 значений'],['ru',1,1,'1 статья · 1 значение'],['ru',2,2,'2 статьи · 2 значения'],['ru',5,5,'5 статей · 5 значений'],
 ['nl',1,1,'1 artikel · 1 betekenis'],['nl',73,115,'73 artikelen · 115 betekenissen'],
] as const)('formats selected totals %s %d/%d',(locale,articles,meanings,label)=>expect(formatLibraryCounts(locale,articles,meanings)).toBe(label));
test('older database has the original article count without invented meanings',()=>expect(formatLibraryCounts('en',73)).toBe('Found: 73'));
