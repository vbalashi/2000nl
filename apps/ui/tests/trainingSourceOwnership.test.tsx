import React from 'react';
import {act,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/lib/collections/sharing/readableTrainingCatalog',()=>({readTrainingCollectionPage:mock.read}));
vi.mock('@/lib/events/userEventHints',()=>({useUserEventHints:()=>{}}));
import {useTrainingSourcePage} from '@/components/library/sharing/useTrainingSourcePage';
import {CollectionSelectionContext} from '@/components/library/sharing/CollectionSelectionContext';
import type {SourceOwnership} from '@/lib/collections/sharing/sourceOwnershipContract';
const id='75600000-0000-4000-8000-000000000001';
const page={collections:[{id,name:'owned',ownership:'owned',availableItemCount:1}],nextCursor:{id,key:'owned',scope:'a'.repeat(64)}};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('NEXT_PUBLIC_COLLECTION_SHARING_ENABLED','true');});afterEach(()=>{vi.unstubAllEnvs();});
test('kind switch aborts old scope and starts a fresh owned/received page without leaking late results',async()=>{
 let settle!:(value:unknown)=>void;mock.read.mockResolvedValueOnce(page).mockReturnValueOnce(new Promise(resolve=>settle=resolve));
 const wrapper=({children}:{children:React.ReactNode})=><CollectionSelectionContext.Provider value={{userId:'reader',languageCode:'nl',onTrainingResolved:()=>{}}}>{children}</CollectionSelectionContext.Provider>;
 const hook=renderHook(({ownership}:{ownership:SourceOwnership})=>useTrainingSourcePage('',ownership),{wrapper,initialProps:{ownership:'owned'}});
 await waitFor(()=>expect(hook.result.current.status).toBe('ready'));expect(mock.read.mock.calls[0][5]).toBe('owned');
 hook.rerender({ownership:'received'});expect(hook.result.current.page.collections).toEqual([]);
 await waitFor(()=>expect(mock.read).toHaveBeenCalledTimes(2));expect(mock.read.mock.calls[0][4].aborted).toBe(true);expect(mock.read.mock.calls[1][3]).toBeNull();expect(mock.read.mock.calls[1][5]).toBe('received');
 await act(async()=>settle({collections:[],nextCursor:null}));expect(hook.result.current.page.collections).toEqual([]);expect(hook.result.current.status).toBe('ready');
});

test('an unresolved old-kind response cannot replace an already resolved received page',async()=>{
 let old!:(value:unknown)=>void,fresh!:(value:unknown)=>void;mock.read.mockReturnValueOnce(new Promise(resolve=>old=resolve)).mockReturnValueOnce(new Promise(resolve=>fresh=resolve));
 const wrapper=({children}:{children:React.ReactNode})=><CollectionSelectionContext.Provider value={{userId:'reader',languageCode:'nl',onTrainingResolved:()=>{}}}>{children}</CollectionSelectionContext.Provider>;
 const hook=renderHook(({ownership}:{ownership:SourceOwnership})=>useTrainingSourcePage('',ownership),{wrapper,initialProps:{ownership:'owned'}});
 await waitFor(()=>expect(mock.read).toHaveBeenCalledTimes(1));hook.rerender({ownership:'received'});await waitFor(()=>expect(mock.read).toHaveBeenCalledTimes(2));expect(mock.read.mock.calls[0][4].aborted).toBe(true);
 const received={collections:[{id,name:'received',ownership:'received',availableItemCount:2}],nextCursor:null};
 await act(async()=>fresh(received));expect(hook.result.current.page).toEqual(received);
 await act(async()=>old(page));expect(hook.result.current.page).toEqual(received);expect(hook.result.current.status).toBe('ready');
});
