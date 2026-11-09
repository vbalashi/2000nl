import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
vi.mock('@/components/library/sharing/useLabelShareCollections',()=>({useLabelShareCollections:()=>({status:'ready',page:{collections:[{collectionId:'child',name:'Child lesson'}],nextCursor:null},references:[{collectionId:"original",name:"Original publication",invitationCode:"A".repeat(26)}]})}));
import {ReceivedGroupScopes} from '@/components/library/organization/ReceivedGroupScopes';
const groups=[{labelId:'group',name:'333',collectionCount:1}];
it('finds received groups and opens a child without making the group an editable personal label',()=>{
 const open=vi.fn();render(<ReceivedGroupScopes userId="reader" locale="en" groups={groups} query="33" onOpen={open}/>);
 fireEvent.click(screen.getByRole('button',{name:'333'}));
 fireEvent.click(screen.getByRole('button',{name:'Child lesson'}));
 expect(open).toHaveBeenCalledWith('child','Child lesson');
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/edit|new label/i})).not.toBeInTheDocument();
});
it('does not leave a prior account group open after account changes',()=>{
 const view=render(<ReceivedGroupScopes userId="reader" locale="en" groups={groups} query="" onOpen={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'333'}));
 view.rerender(<ReceivedGroupScopes userId="other" locale="en" groups={groups} query="" onOpen={()=>{}}/>);
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('opens an original publication invitation without treating it as granted group access',()=>{
 const onOpen=vi.fn(),onReference=vi.fn();render(<ReceivedGroupScopes userId="reader" locale="en" groups={groups} query="" onOpen={onOpen} onReference={onReference}/>);
 fireEvent.click(screen.getByRole('button',{name:'333'}));fireEvent.click(screen.getByRole('button',{name:'Original publication'}));
 expect(onReference).toHaveBeenCalledWith('A'.repeat(26));expect(onOpen).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
