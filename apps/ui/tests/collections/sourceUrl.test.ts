import {expect,test} from 'vitest';
import {normalizeSourceUrl} from '@/lib/collections/details/sourceUrl';
test.each([
 ['www.lib.ru','https://www.lib.ru/'],
 [' lib.ru/books ','https://lib.ru/books'],
 ['//example.com/a','https://example.com/a'],
 ['http://example.com/a','http://example.com/a'],
 ['https://example.com/a b','https://example.com/a%20b'],
 ['',null],['  ',null],
])('normalizes %s', (input,value)=>expect(normalizeSourceUrl(input)).toEqual({ok:true,value}));
test.each(['not a website','неверный адрес','ftp://example.com','javascript:alert(1)','https://','https://bad host/'])('keeps invalid or unsupported %s out of stored links',input=>expect(normalizeSourceUrl(input)).toEqual({ok:false}));
