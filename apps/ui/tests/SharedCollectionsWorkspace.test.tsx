import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({overview:vi.fn(),owned:vi.fn(),received:vi.fn()}));
vi.mock('@/components/library/sharing/useSharingOverview',()=>({useSharingOverview:mock.overview}));
vi.mock('@/components/library/sharing/OwnedSharedCollections',()=>({OwnedSharedCollections:(props:unknown)=>{mock.owned(props);return <div>Owned list</div>;}}));
vi.mock('@/components/library/sharing/ReceivedCollections',()=>({ReceivedCollections:(props:unknown)=>{mock.received(props);return <div>Received list</div>;}}));
import {SharedCollectionsWorkspace} from '@/components/library/sharing/SharedCollectionsWorkspace';
const base={userId:'owner',active:true,locale:'en' as const,onViewChange:vi.fn(),onOpenOwned:vi.fn(),onOpenReceived:vi.fn(),onAdd:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();mock.overview.mockReturnValue({status:'ready',data:{sharedByMe:12,addedByMe:4},refresh:vi.fn()});});
test('accepted Shared layout shows both counts, one Add action and selected collection list',()=>{
 const view=render(<SharedCollectionsWorkspace {...base} view="owned"/>);
 expect(screen.getByRole('button',{name:'Shared by me · 12'})).toHaveAttribute('aria-pressed','true');expect(screen.getByRole('button',{name:'Added by me · 4'})).toHaveAttribute('aria-pressed','false');
 expect(screen.getByText('Owned list')).toBeInTheDocument();expect(screen.getAllByRole('button',{name:'Add by link / code'})).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Added by me · 4'}));expect(base.onViewChange).toHaveBeenCalledWith('received');
 view.rerender(<SharedCollectionsWorkspace {...base} view="received"/>);expect(screen.getByText('Received list')).toBeInTheDocument();expect(mock.received).toHaveBeenCalledWith(expect.objectContaining({embedded:true}));
});
