import React from 'react';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {usePreviewTextSize} from '@/app/dev/session-builder-prototype/usePreviewTextSize';
function Probe(){const state=usePreviewTextSize();return <button disabled={!state.ready} onClick={()=>state.setSize('extra')}>{state.size}</button>;}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
test('preview preference survives remount and preserves the other device',async()=>{
 const entries=new Map([['2000nl-preview-text-size-v1',JSON.stringify({desktop:'larger',phone:'large'})]]);
 const storage={getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>entries.set(key,value)};
 vi.stubGlobal('localStorage',storage);
 const first=render(<Probe/>);
 await screen.findByRole('button',{name:'larger'});
 fireEvent.click(screen.getByRole('button'));
 await waitFor(()=>expect(JSON.parse(entries.get('2000nl-preview-text-size-v1')!)).toEqual({desktop:'extra',phone:'large'}));
 first.unmount();render(<Probe/>);
 await screen.findByRole('button',{name:'extra'});
});
