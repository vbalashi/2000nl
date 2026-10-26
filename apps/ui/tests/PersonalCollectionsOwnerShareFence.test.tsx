import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
const badge=vi.hoisted(()=>({hook:vi.fn()}));

vi.mock('@/components/library/organization/usePersonalLabels',()=>({usePersonalLabels:()=>({snapshot:{revision:0,labels:[],assignments:[]},error:null,loading:false,busy:false,refresh:vi.fn(),mutate:vi.fn()})}));
vi.mock('@/components/library/organization/usePersonalCollectionCatalog',()=>({usePersonalCollectionCatalog:badge.hook}));
vi.mock('@/components/practice/ui/ActionMenu',()=>({ActionMenu:({items}:{items:Array<{id:string;label:string;onSelect:()=>void}>})=><div>{items.map(item=><button key={item.id} onClick={item.onSelect}>{item.label}</button>)}</div>}));
vi.mock('@/components/library/sharing/OwnedCollectionSharing',()=>({OwnedCollectionSharing:({userId,name}:{userId:string;name:string})=><div data-testid="owner-sharing">{userId}:{name}</div>}));
vi.mock('@/components/library/organization/ReceivedCollectionLabels',()=>({ReceivedCollectionLabels:({name}:{name:string})=><div data-testid="received-label-editor">{name}</div>}));
vi.mock('@/lib/collections/sharing/ownerShareJournal',()=>({ownerShareStore:()=>null,readOwnerShareJournal:()=>null}));

import {PersonalCollections} from '@/components/library/organization/PersonalCollections';

const first={id:'75600000-0000-4000-8000-000000000001',name:'First owner lesson',type:'user' as const,item_count:1};
const second={id:'75600000-0000-4000-8000-000000000002',name:'Second owner lesson',type:'user' as const,item_count:1};
const base={active:true,language:'nl',locale:'en' as const,onReload:async()=>{},onOpen:()=>{}};
let prior:string|undefined;
const catalogRow=(row:typeof first,isShared:boolean)=>({id:row.id,name:row.name,createdAt:'2026-01-01T00:00:00Z',ownership:'owned',isShared,itemCount:1,labelIds:[]});
beforeEach(()=>{prior=process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED;process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED='true';badge.hook.mockImplementation(({userId}:{userId:string})=>({status:'ready',collections:userId==='first'?[catalogRow(first,true),catalogRow(second,false)]:[catalogRow(second,false)],nextCursor:null,refresh:vi.fn()}));});
afterEach(()=>{if(prior===undefined)delete process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED;else process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED=prior;});

test('old owner name and sharing dialog vanish on the first render of another account',()=>{
 const view=render(<PersonalCollections {...base} userId="first" collections={[first]}/>);
 fireEvent.click(screen.getByRole('button',{name:'More actions: First owner lesson'}));
 fireEvent.click(screen.getByRole('button',{name:'Share'}));
 expect(screen.getByTestId('owner-sharing')).toHaveTextContent('first:First owner lesson');
 view.rerender(<PersonalCollections {...base} userId="second" collections={[second]}/>);
 expect(screen.queryByTestId('owner-sharing')).not.toBeInTheDocument();
 expect(screen.queryByText('First owner lesson')).not.toBeInTheDocument();
});
test('owner rows distinguish shared from personal, and uncertain status never labels a row personal',()=>{
 const view=render(<PersonalCollections {...base} userId="first" collections={[first,second]}/>);
 expect(screen.getByText('Shared')).toBeInTheDocument();expect(screen.getByText('Personal')).toBeInTheDocument();
 badge.hook.mockReturnValue({status:'loading',collections:[],nextCursor:null,refresh:vi.fn()});view.rerender(<PersonalCollections {...base} userId="first" collections={[first,second]}/>);
 expect(screen.queryByText('Personal')).not.toBeInTheDocument();expect(screen.queryByText('Shared')).not.toBeInTheDocument();
});
test('received collection exposes only opening and personal label assignment',()=>{
 const onOpenReceived=vi.fn();badge.hook.mockReturnValue({status:'ready',collections:[{...catalogRow(first,true),ownership:'received'}],nextCursor:null,refresh:vi.fn()});
 render(<PersonalCollections {...base} onOpenReceived={onOpenReceived} userId="first" collections={[]}/>);
 expect(screen.getByText('Shared · added by you')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'First owner lesson'}));expect(onOpenReceived).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'More actions: First owner lesson'}));expect(screen.queryByRole('button',{name:'Share'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Rename'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Delete'})).not.toBeInTheDocument();
});
test('pasted search is bounded by Unicode code points before catalog requests',()=>{
 render(<PersonalCollections {...base} userId="first" collections={[first]}/>);
 const input=screen.getByRole('textbox',{name:'Search collections'});fireEvent.change(input,{target:{value:'😀'.repeat(120)}});
 expect(input).toHaveValue('😀'.repeat(100));expect([...badge.hook.mock.calls.at(-1)![0].query.query]).toHaveLength(100);
});
test('recipient editor name is hidden on the first render after an account change',()=>{
 badge.hook.mockImplementation(({userId}:{userId:string})=>({status:'ready',collections:userId==='first'?[{...catalogRow(first,true),ownership:'received'}]:[],nextCursor:null,refresh:vi.fn()}));
 const view=render(<PersonalCollections {...base} userId="first" collections={[]}/>);fireEvent.click(screen.getByRole('button',{name:'More actions: First owner lesson'}));fireEvent.click(screen.getByRole('button',{name:'Choose labels'}));
 expect(screen.getByTestId('received-label-editor')).toHaveTextContent('First owner lesson');view.rerender(<PersonalCollections {...base} userId="second" collections={[]}/>);expect(screen.queryByTestId('received-label-editor')).not.toBeInTheDocument();
});
