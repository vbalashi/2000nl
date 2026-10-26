import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {usePracticeAppearance} from '@/components/practice/ui/usePracticeAppearance';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function media(){const listeners=new Set<()=>void>();const query={matches:false,addEventListener:vi.fn((_:string,callback:()=>void)=>listeners.add(callback)),removeEventListener:vi.fn((_:string,callback:()=>void)=>listeners.delete(callback))};vi.stubGlobal('matchMedia',()=>query);return {query,listeners};}
test('palette and mode persist independently, and System responds to OS changes',()=>{
 const m=media(),data=new Map<string,string>([['preview',JSON.stringify({palette:'blue',mode:'System'})]]);
 vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)||null,setItem:(key:string,value:string)=>data.set(key,value)});
 const {result,unmount}=renderHook(()=>usePracticeAppearance('preview'));
 expect(result.current.palette).toBe('blue');expect(result.current.dark).toBe(false);
 act(()=>{m.query.matches=true;m.listeners.forEach(listener=>listener());});expect(result.current.dark).toBe(true);
 act(()=>result.current.setPalette('graphite'));expect(result.current.mode).toBe('System');
 act(()=>result.current.setMode('Light'));expect(result.current.dark).toBe(false);expect(JSON.parse(data.get('preview')!)).toEqual({palette:'graphite',mode:'Light'});
 unmount();expect(m.listeners.size).toBe(0);
});
test('corrupt or denied storage does not stop switching themes',()=>{
 media();vi.stubGlobal('localStorage',{getItem:()=>'{broken',setItem:()=>{throw new Error('Denied');}});
 const {result}=renderHook(()=>usePracticeAppearance('preview'));expect(result.current.palette).toBe('lavender');act(()=>result.current.setMode('Dark'));expect(result.current.dark).toBe(true);
});

test('a changed storage key is read before the previous preference can overwrite it',()=>{
 media();const data=new Map([['first',JSON.stringify({palette:'blue',mode:'Dark'})],['second',JSON.stringify({palette:'graphite',mode:'Light'})]]);
 vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)||null,setItem:(key:string,value:string)=>data.set(key,value)});
 const {result,rerender}=renderHook(({key})=>usePracticeAppearance(key),{initialProps:{key:'first'}});
 rerender({key:'second'});expect(result.current.palette).toBe('graphite');expect(result.current.mode).toBe('Light');expect(JSON.parse(data.get('second')!)).toEqual({palette:'graphite',mode:'Light'});
});
