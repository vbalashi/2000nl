import {afterEach,expect,test,vi} from 'vitest';
import {practicePaletteRepository} from '@/lib/preferences/practicePaletteRepository';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
test('palette save updates no unrelated preferences',async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response(null,{status:201}));vi.stubGlobal('fetch',fetch);await practicePaletteRepository.save('reader','blue');const [,init]=fetch.mock.calls[0];expect(JSON.parse(init.body)).toEqual({user_id:'reader',practice_palette:'blue'});
});
test('stalled palette loads release the loading state within ten seconds',async()=>{
 vi.useFakeTimers();const fetch=vi.fn((_url:unknown,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))));vi.stubGlobal('fetch',fetch);const result=practicePaletteRepository.load('reader').catch(error=>error);await vi.waitFor(()=>expect(fetch).toHaveBeenCalled());await vi.advanceTimersByTimeAsync(10000);expect(await result).toEqual(new Error('practice_palette_load_failed'));
});
test('invalid palette is rejected before reaching storage',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(practicePaletteRepository.save('reader','invalid' as 'blue')).rejects.toThrow('invalid_practice_palette');expect(fetch).not.toHaveBeenCalled();
});
test('Indigo round trips through the account preference repository',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(new Response(null,{status:201})).mockResolvedValueOnce(new Response(JSON.stringify({practice_palette:'indigo'}),{status:200}));
 vi.stubGlobal('fetch',fetch);
 await practicePaletteRepository.save('reader','indigo');
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({user_id:'reader',practice_palette:'indigo'});
 await expect(practicePaletteRepository.load('reader')).resolves.toBe('indigo');
});
