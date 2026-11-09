import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {ReceivedGroupScopes} from '@/components/library/organization/ReceivedGroupScopes';
const groups=[{labelId:'group',name:'333',collectionCount:1}];
it('selects a received group as catalog navigation without opening a modal',()=>{
 const select=vi.fn();render(<ReceivedGroupScopes locale="en" groups={groups} query="33" selectedId={null} onSelect={select}/>);
 fireEvent.click(screen.getByRole('button',{name:'333'}));expect(select).toHaveBeenCalledWith(groups[0]);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('shows the selected scope and filters only the navigation list',()=>{
 render(<ReceivedGroupScopes locale="en" groups={groups} query="33" selectedId="group" onSelect={()=>{}}/>);
 expect(screen.getByRole('button',{name:'333'})).toHaveAttribute('aria-pressed','true');
});
