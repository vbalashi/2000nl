import {act,renderHook,waitFor} from '@testing-library/react';
import {expect,test,vi} from 'vitest';
const {load,reload}=vi.hoisted(()=>({load:vi.fn(),reload:vi.fn()}));
vi.mock('@/lib/trainingService',()=>({fetchAvailableLists:load}));
vi.mock('@/components/practice/material/useMaterialDictionaryCatalog',()=>({useMaterialDictionaryCatalog:()=>({status:'ready',sources:[],reload})}));
import {useTrainingEditorMaterial} from '@/components/training/pilot/useTrainingEditorMaterial';
test('foreign catalog retry reloads both collections and dictionaries',async()=>{
 load.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([{id:'english',type:'user',name:'English lesson'}]);
 const {result}=renderHook(()=>useTrainingEditorMaterial('owner','en'));await waitFor(()=>expect(result.current.status).toBe('error'));
 act(()=>result.current.reload());await waitFor(()=>expect(result.current.status).toBe('ready'));expect(load).toHaveBeenCalledTimes(2);expect(reload).toHaveBeenCalledOnce();expect(result.current.lists).toEqual([{value:'user:english',label:'English lesson'}]);
});
