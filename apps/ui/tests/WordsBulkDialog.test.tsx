import React from 'react';
import {beforeEach,expect,test,vi} from 'vitest';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import type {WordsBulkRequest} from '@/lib/platform/wordsBulkClient';
import {WordsBulkDialog} from '@/components/training/wordlist/WordsBulkDialog';
const {request,receipt,create,fetchLists,access}=vi.hoisted(()=>({request:vi.fn(),receipt:vi.fn(),create:vi.fn(),fetchLists:vi.fn(),access:vi.fn()}));
vi.mock('@/lib/collections/sharing/ownedAccessMetadataClient',()=>({readOwnedCollectionAccessMetadata:access}));
vi.mock('@/lib/platform/wordsBulkClient',()=>({wordsBulkCollection:request,wordsBulkReceipt:receipt}));
vi.mock('@/lib/training/listService',()=>({createUserList:create,fetchUserLists:fetchLists}));
beforeEach(()=>{sessionStorage.clear();request.mockReset();receipt.mockReset();create.mockReset();fetchLists.mockReset();access.mockReset().mockImplementation(async(_user:string,ids:string[])=>ids.map(collectionId=>({collectionId,isShared:false,subscriberCount:0})));Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value(){this.setAttribute('open','');}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value(){this.removeAttribute('open');}});});
const selection:Omit<WordsBulkRequest,'listId'>={groups:['article-a','article-b'],all:false,category:'browse',query:'',language:'nl',dictionaryIds:null,filters:{parts:[],article:null}};
test('previews matching meanings and confirms exactly the previewed selection',async()=>{
 request.mockResolvedValueOnce({articleCount:2,meaningCount:3,planId:'abc',audience:[]});receipt.mockResolvedValueOnce({status:'committed',collectionId:'owned',addedCount:2});
 const done=vi.fn();render(<WordsBulkDialog userId="account" language="en" lists={[{id:'owned',name:'Lesson',type:'user'},{id:'received',name:'Shared',type:'user',ownership:'received'}]} selection={selection} onClose={vi.fn()} onDone={done}/>);
 expect(screen.queryByRole('button',{name:'Shared'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Lesson'}));
 expect(await screen.findByText('Articles: 2 · meanings: 3')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Add meanings'}));
 await waitFor(()=>expect(done).toHaveBeenCalledWith(2));
 expect(receipt).toHaveBeenCalledWith('account','abc',true);
});
test('requires a fresh preview after the matching meanings change',async()=>{
 request.mockResolvedValueOnce({articleCount:2,meaningCount:3,planId:'old',audience:[]}).mockResolvedValueOnce({articleCount:2,meaningCount:2,planId:'new',audience:[]});receipt.mockRejectedValueOnce(new Error('selection_changed'));
 render(<WordsBulkDialog userId="account" language="en" lists={[{id:'owned',name:'Lesson',type:'user'}]} selection={selection} onClose={vi.fn()} onDone={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Lesson'}));await screen.findByText('Articles: 2 · meanings: 3');
 fireEvent.click(screen.getByRole('button',{name:'Add meanings'}));
 await screen.findByText('The matching meanings changed. Review the updated count.');
 expect(screen.getByRole('button',{name:'Add meanings'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Try again'}));
 expect(await screen.findByText('Articles: 2 · meanings: 2')).toBeInTheDocument();
});

test('creates a collection in place and previews it before adding',async()=>{
 create.mockResolvedValue({id:'new-list',name:'My new list',type:'user'});
 request.mockResolvedValueOnce({articleCount:2,meaningCount:3,planId:'abc',audience:[]});
 const updated=vi.fn();render(<WordsBulkDialog userId="account" language="en" lists={[]} selection={selection} onClose={vi.fn()} onDone={vi.fn()} onListsUpdated={updated}/>);
 fireEvent.click(screen.getByRole('button',{name:'New collection'}));
 fireEvent.change(screen.getByRole('textbox',{name:'New collection name'}),{target:{value:'My new list'}});
 fireEvent.click(screen.getByRole('button',{name:'Create'}));
 expect(await screen.findByText('Articles: 2 · meanings: 3')).toBeInTheDocument();
 expect(create).toHaveBeenCalledWith({userId:'account',name:'My new list',language_code:'nl'});
 expect(updated).toHaveBeenCalledOnce();expect(screen.getByRole('button',{name:'My new list'})).toHaveAttribute('aria-pressed','true');
});
test('shows shared audience and checks an uncertain result without repeating the add',async()=>{
 request.mockResolvedValueOnce({articleCount:2,meaningCount:3,planId:'planned',audience:[{userId:'reader'}]});
 receipt.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({planId:'planned',status:'pending',collectionId:'owned'}).mockResolvedValueOnce({planId:'planned',status:'committed',collectionId:'owned',addedCount:3});
 const done=vi.fn();render(<WordsBulkDialog userId="account" language="en" lists={[{id:'owned',name:'Lesson',type:'user'}]} selection={selection} onClose={vi.fn()} onDone={done}/>);
 fireEvent.click(screen.getByRole('button',{name:'Lesson'}));
 await screen.findByText('Shared · 1 subscriber');
 expect(screen.queryByText(/They can see this change/)).not.toBeInTheDocument();
 expect(sessionStorage.getItem('words-bulk-confirm:account')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Add meanings'}));
 fireEvent.click(await screen.findByRole('button',{name:'Check result'}));
 await screen.findByText('The result is not available yet. Check again before retrying.');
 expect(receipt).toHaveBeenCalledTimes(2);expect(receipt).toHaveBeenLastCalledWith('account','planned',false);
 fireEvent.click(screen.getByRole('button',{name:'Check result'}));
 await waitFor(()=>expect(done).toHaveBeenCalledWith(3));
 expect(sessionStorage.getItem('words-bulk-confirm:account')).toBeNull();
});

test('checks saved state before clearing a damaged local confirmation',async()=>{
 sessionStorage.setItem('words-bulk-confirm:account','damaged');fetchLists.mockResolvedValue([]);
 render(<WordsBulkDialog userId="account" language="en" lists={[]} selection={selection} onClose={vi.fn()} onDone={vi.fn()}/>);
 const recovery=await screen.findByRole('dialog',{name:'Local recovery'});
 const clear=await within(recovery).findByRole('button',{name:'Clear local record'});
 await waitFor(()=>expect(clear).toBeEnabled());expect(fetchLists).toHaveBeenCalledWith('account','nl');
 fireEvent.click(clear);expect(sessionStorage.getItem('words-bulk-confirm:account')).toBeNull();expect(receipt).not.toHaveBeenCalled();
});
test('explicit retry reads and verifies the pending plan before repeating its confirmation',async()=>{
 request.mockResolvedValueOnce({articleCount:2,meaningCount:3,planId:'planned',audience:[]});
 receipt.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({planId:'planned',status:'pending',collectionId:'owned'}).mockResolvedValueOnce({planId:'planned',status:'committed',collectionId:'owned',addedCount:3});
 const done=vi.fn();render(<WordsBulkDialog userId="account" language="en" lists={[{id:'owned',name:'Lesson',type:'user'}]} selection={selection} onClose={vi.fn()} onDone={done}/>);
 fireEvent.click(screen.getByRole('button',{name:'Lesson'}));await screen.findByText('Articles: 2 · meanings: 3');
 fireEvent.click(screen.getByRole('button',{name:'Add meanings'}));fireEvent.click(await screen.findByRole('button',{name:'Retry confirmed change'}));
 await waitFor(()=>expect(done).toHaveBeenCalledWith(3));
 expect(receipt.mock.calls.map(call=>call[2])).toEqual([true,false,true]);
});
test('does not retry a pending plan for a different collection',async()=>{
 request.mockResolvedValueOnce({articleCount:2,meaningCount:3,planId:'planned',audience:[]});
 receipt.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({planId:'planned',status:'pending',collectionId:'other'});
 render(<WordsBulkDialog userId="account" language="en" lists={[{id:'owned',name:'Lesson',type:'user'}]} selection={selection} onClose={vi.fn()} onDone={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Lesson'}));await screen.findByText('Articles: 2 · meanings: 3');
 fireEvent.click(screen.getByRole('button',{name:'Add meanings'}));fireEvent.click(await screen.findByRole('button',{name:'Retry confirmed change'}));
 await waitFor(()=>expect(receipt).toHaveBeenCalledTimes(2));expect(receipt.mock.calls.map(call=>call[2])).toEqual([true,false]);
});
test('loads badges in one batch and keeps published zero-subscriber collections shared',async()=>{
 access.mockResolvedValue([{collectionId:'private',isShared:false,subscriberCount:0},{collectionId:'published',isShared:true,subscriberCount:0}]);
 render(<WordsBulkDialog userId="account" language="en" lists={[{id:'private',name:'Private lesson',type:'user'},{id:'published',name:'Published lesson',type:'user'}]} selection={selection} onClose={vi.fn()} onDone={vi.fn()}/>);
 expect(await screen.findByText('Shared · 0 subscribers')).toBeInTheDocument();expect(screen.getByText('Private')).toBeInTheDocument();
 expect(access).toHaveBeenCalledTimes(1);expect(access).toHaveBeenCalledWith('account',['private','published'],expect.any(AbortSignal));
 expect(screen.getByRole('button',{name:'Published lesson'})).toHaveAccessibleDescription('Shared · 0 subscribers');
});
test('does not label missing metadata private or allow a new confirmation',async()=>{
 access.mockResolvedValue([]);request.mockResolvedValue({articleCount:2,meaningCount:3,planId:'planned',audience:[]});
 render(<WordsBulkDialog userId="account" language="en" lists={[{id:'missing',name:'Unresolved',type:'user'}]} selection={selection} onClose={vi.fn()} onDone={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Unresolved'}));await screen.findByText('Articles: 2 · meanings: 3');
 expect(screen.queryByText('Private')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Add meanings'})).toBeDisabled();
});

test('retries a failed badge batch before a collection is selected',async()=>{
 access.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([{collectionId:'owned',isShared:false,subscriberCount:0}]);
 render(<WordsBulkDialog userId="account" language="en" lists={[{id:'owned',name:'Lesson',type:'user'}]} selection={selection} onClose={vi.fn()} onDone={vi.fn()}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Try again'}));
 expect(await screen.findByText('Private')).toBeInTheDocument();expect(access).toHaveBeenCalledTimes(2);expect(receipt).not.toHaveBeenCalled();
});

test('keeps the prepared preview when the selected collection is clicked again',async()=>{
 request.mockResolvedValueOnce({articleCount:2,meaningCount:3,planId:'planned',audience:[]});
 render(<WordsBulkDialog userId="account" language="en" lists={[{id:'owned',name:'Lesson',type:'user'}]} selection={selection} onClose={vi.fn()} onDone={vi.fn()}/>);
 const choice=screen.getByRole('button',{name:'Lesson'});fireEvent.click(choice);
 await screen.findByText('Articles: 2 · meanings: 3');
 await waitFor(()=>expect(screen.getByRole('button',{name:'Add meanings'})).toBeEnabled());
 fireEvent.click(choice);
 expect(screen.getByText('Articles: 2 · meanings: 3')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Add meanings'})).toBeEnabled();expect(request).toHaveBeenCalledOnce();
});

test('clears a hidden selected destination and ignores its late preparation result',async()=>{
 let finish!:(value:unknown)=>void;request.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce({articleCount:2,meaningCount:3,planId:'b-plan',audience:[]});
 render(<WordsBulkDialog userId="account" language="en" lists={[{id:'a',name:'Alpha',type:'user'},{id:'b',name:'Beta',type:'user'}]} selection={selection} onClose={vi.fn()} onDone={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Alpha'}));
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Beta'}});
 await act(async()=>finish({articleCount:2,meaningCount:3,planId:'a-plan',audience:[]}));
 expect(screen.getByRole('button',{name:'Add meanings'})).toBeDisabled();
 expect(screen.queryByText('Articles: 2 · meanings: 3')).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Beta'})).toHaveAttribute('aria-pressed','false');
 fireEvent.click(screen.getByRole('button',{name:'Beta'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Add meanings'})).toBeEnabled());
 expect(request.mock.calls[1][1].listId).toBe('b');
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Alpha'}});
 expect(screen.getByRole('button',{name:'Add meanings'})).toBeDisabled();
 expect(screen.queryByText('Articles: 2 · meanings: 3')).not.toBeInTheDocument();
 await act(async()=>{});
});
