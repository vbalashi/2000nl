import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({hook:vi.fn(),save:vi.fn(),check:vi.fn(),draft:vi.fn(),reload:vi.fn()}));
vi.mock('@/lib/collections/sharing/ownNoteClient',()=>({readOwnNote:vi.fn(async()=>({state:'ready',note:{entryId:'entry',revision:'0',notes:null}}))}));
vi.mock('@/components/library/notes/useOwnNoteEditor',()=>({useOwnNoteEditor:mock.hook}));
vi.mock('@/components/practice/ui/DialogSurface',()=>({DialogSurface:({children}:{children:React.ReactNode})=><div role="dialog">{children}</div>}));
import {OwnNoteEditor} from '@/components/library/notes/OwnNoteEditor';
const props={userId:'reader',entryId:'entry',locale:'en' as const,onClose:vi.fn(),onSaved:vi.fn()};
const state={key:'key',status:'editing',draft:'Draft',base:{notes:null,revision:'0'},server:null,sent:null};
beforeEach(()=>{sessionStorage.clear();vi.clearAllMocks();mock.hook.mockReturnValue({state,setDraft:mock.draft,save:mock.save,check:mock.check,reload:mock.reload,valid:true,dirty:true,discard:vi.fn()});});
test('dirty cancellation confirms before discarding the draft',()=>{
 render(<OwnNoteEditor {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(props.onClose).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Keep editing'}));expect(screen.getByRole('textbox')).toHaveValue('Draft');
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));fireEvent.click(screen.getByRole('button',{name:'Discard'}));expect(props.onClose).toHaveBeenCalledOnce();expect(mock.save).not.toHaveBeenCalled();
});
test('conflict displays current text separately from editable draft and overwrite is explicit',()=>{
 mock.hook.mockReturnValue({state:{...state,status:'conflict',server:{notes:'Server text'}},setDraft:mock.draft,save:mock.save,valid:true,dirty:true,discard:vi.fn()});render(<OwnNoteEditor {...props}/>);
 expect(screen.getByText('Server text')).toBeInTheDocument();expect(screen.getByRole('textbox')).toHaveValue('Draft');fireEvent.click(screen.getByRole('button',{name:'Save my version'}));expect(mock.save).toHaveBeenCalledWith(true);
});
test('lost acknowledgement offers only read-only checking, never a second save',()=>{
 mock.hook.mockReturnValue({state:{...state,status:'uncertain'},check:mock.check,valid:true,dirty:true,discard:vi.fn()});render(<OwnNoteEditor {...props}/>);expect(screen.getByRole('textbox')).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Check result'}));expect(mock.check).toHaveBeenCalledOnce();expect(mock.save).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Cancel'})).not.toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(props.onClose).toHaveBeenCalledOnce();
});
test('confirmed result notifies parent once, which refreshes the existing article',()=>{
 mock.hook.mockReturnValue({state:{...state,status:'saved'},valid:true,dirty:false});const view=render(<OwnNoteEditor {...props}/>);view.rerender(<OwnNoteEditor {...props}/>);expect(props.onSaved).toHaveBeenCalledOnce();
});

test('closing corrupt recovery keeps typed note behind the normal discard confirmation',async()=>{
 sessionStorage.setItem('2000nl.own-note-draft.v1.reader.entry','broken');render(<OwnNoteEditor {...props}/>);
 await screen.findByRole('button',{name:'Clear local record'});fireEvent.click(screen.getByRole('button',{name:'Close'}));
 expect(props.onClose).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Keep editing'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Keep editing'}));expect(screen.getByRole('textbox')).toHaveValue('Draft');expect(mock.save).not.toHaveBeenCalled();
});
