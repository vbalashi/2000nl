import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
vi.mock('@/components/library/sharing/useLabelShareCollections',()=>({useLabelShareCollections:()=>({status:'ready',page:{collections:[{collectionId:'own',name:'My lesson'}],nextCursor:null},references:[{collectionId:'original',name:'Another author',invitationCode:'A'.repeat(26)}]})}));
import {SharedLabelContents} from '@/components/library/sharing/SharedLabelContents';
it('opens an original invitation separately from opening a group-owned collection',()=>{
 const onOpen=vi.fn(),onReference=vi.fn();render(<SharedLabelContents userId="owner" labelId="group" name="Group" locale="en" onClose={()=>{}} onOpen={onOpen} onReference={onReference}/>);
 expect(onReference).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Another author'}));expect(onReference).toHaveBeenCalledWith('A'.repeat(26));expect(onOpen).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'My lesson'}));expect(onOpen).toHaveBeenCalledWith('own');
});

it('opens the selected label in the collection catalogue',()=>{
 const onOpenLabel=vi.fn();render(<SharedLabelContents userId="owner" labelId="group" name="Group" locale="en" onClose={()=>{}} onOpen={()=>{}} onOpenLabel={onOpenLabel}/>);
 fireEvent.click(screen.getByRole('button',{name:'Open in collections'}));expect(onOpenLabel).toHaveBeenCalledOnce();
});
