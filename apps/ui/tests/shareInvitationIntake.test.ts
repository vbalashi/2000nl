import {beforeEach, expect, test, vi} from 'vitest';
import {captureShareInvitation,rememberShareInvitation,readPendingShareInvitation,forgetShareInvitation,rememberAccountSharePreview,readAccountSharePreview,forgetAccountSharePreview} from '@/lib/collections/sharing/shareInvitationIntake';
const code='A'.repeat(26),origin='https://2000.dilum.io';
let values: Map<string,string>;
const makeStorage=()=>({
 getItem:vi.fn((k:string):string|null=>values.get(k)??null),
 setItem:vi.fn((k:string,v:string):void=>{values.set(k,v);}),
 removeItem:vi.fn((k:string):void=>{values.delete(k);}),
});
let storage: ReturnType<typeof makeStorage>;
beforeEach(()=>{values=new Map();storage=makeStorage();});

test('scrubs invitation from history before retaining it and returns only preview authority',()=>{
 const replace=vi.fn(()=>expect(storage.setItem).not.toHaveBeenCalled());
 expect(captureShareInvitation(`${origin}/share#${code}`,origin,storage,replace,100)).toBe(code);
 expect(replace).toHaveBeenCalledWith('/share');
 expect(readPendingShareInvitation(storage,101)).toBe(code);
 forgetShareInvitation(storage);expect(readPendingShareInvitation(storage,101)).toBeNull();
});
test.each([code,`${origin}/share/${code}`,`${origin}.evil.test/share#${code}`,`${origin}/share?next=x#${code}`])('does not capture malformed or unsafe URL %s',href=>{
 const replace=vi.fn();expect(captureShareInvitation(href,origin,storage,replace,100)).toBeNull();
 expect(replace).not.toHaveBeenCalled();expect(storage.setItem).not.toHaveBeenCalled();
});
test('blocked storage never falls back to URL or persistent storage',()=>{
 storage.setItem.mockImplementation(()=>{throw new Error('denied');});const replace=vi.fn();
 expect(captureShareInvitation(`${origin}/share#${code}`,origin,storage,replace,100)).toBe(code);
 expect(replace).toHaveBeenCalledWith('/share');expect(readPendingShareInvitation(storage,100)).toBeNull();
});
test.each([99,100+30*60*1000])('expires future or stale timestamps and removes secret at %s',now=>{
 rememberShareInvitation(storage,code,100);
 expect(readPendingShareInvitation(storage,now)).toBeNull();expect(values.size).toBe(0);
});
test.each(['null','[]','{','{"code":"secret","capturedAt":100}'])('rejects corrupt storage %s',raw=>{
 rememberShareInvitation(storage,code,100);const key=[...values.keys()][0];values.set(key,raw);
 expect(readPendingShareInvitation(storage,101)).toBeNull();expect(values.size).toBe(0);
});
test('URL replacement failure does not retain the secret for later automatic processing',()=>{
 expect(()=>captureShareInvitation(`${origin}/share#${code}`,origin,storage,()=>{throw new Error('history denied');},100)).toThrow('history denied');
 expect(storage.setItem).not.toHaveBeenCalled();
});

test('claimed preview survives neutral intake clearing only for its account and expires',()=>{
 expect(rememberAccountSharePreview(storage,'A',code,100)).toBe(true);
 rememberShareInvitation(storage,code,100);forgetShareInvitation(storage);
 expect(readAccountSharePreview(storage,'A',101)).toBe(code);expect(readAccountSharePreview(storage,'B',101)).toBeNull();
 expect(readAccountSharePreview(storage,'A',100+30*60*1000)).toBeNull();
});
test('cancel clears only that account preview; denied storage has no persistent fallback',()=>{
 rememberAccountSharePreview(storage,'A',code,100);rememberAccountSharePreview(storage,'B',code,100);
 forgetAccountSharePreview(storage,'A');expect(readAccountSharePreview(storage,'A',101)).toBeNull();expect(readAccountSharePreview(storage,'B',101)).toBe(code);
 storage.getItem.mockImplementation(()=>{throw Error('denied');});expect(readAccountSharePreview(storage,'B',101)).toBeNull();
});
