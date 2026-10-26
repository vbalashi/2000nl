import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({hook:vi.fn(),start:vi.fn(),check:vi.fn(),retry:vi.fn()}));
vi.mock('@/components/library/sharing/useShareMutation',()=>({useUnsubscribeCollection:mock.hook}));
vi.mock('@/components/practice/ui/DialogSurface',()=>({DialogSurface:({children}:{children:React.ReactNode})=><div role="dialog">{children}</div>}));
import {UnsubscribeCollection} from '@/components/library/sharing/ReceivedCollectionActions';
const row={id:'75600000-0000-4000-8000-000000000001',name:'Lesson',createdAt:'2026-01-01T00:00:00Z',addedAt:'2026-01-01T00:00:00Z',ownerUserId:'owner',role:'viewer' as const,itemCount:2,labelIds:[]};
const props={userId:'reader',row,locale:'en' as const,onClose:vi.fn(),onDone:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();mock.hook.mockReturnValue({state:{status:'ready'},start:mock.start,check:mock.check,retry:mock.retry});});
test('opening confirmation has no mutation, cancellation stays local',()=>{
 render(<UnsubscribeCollection {...props}/>);expect(mock.start).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(props.onClose).toHaveBeenCalledOnce();expect(mock.start).not.toHaveBeenCalled();
});
test('explicit confirm starts unsubscribe and uncertain result offers check/retry',()=>{
 const view=render(<UnsubscribeCollection {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Remove from my library'}));expect(mock.start).toHaveBeenCalledOnce();
 mock.hook.mockReturnValue({state:{status:'uncertain'},check:mock.check,retry:mock.retry});view.rerender(<UnsubscribeCollection {...props}/>);expect(screen.getByRole('button',{name:'Cancel'})).not.toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Check result'}));expect(mock.check).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(props.onClose).toHaveBeenCalledOnce();expect(mock.start).toHaveBeenCalledOnce();
});
test('committed unsubscribe finishes even when another reading basis remains available',()=>{
 mock.hook.mockReturnValue({state:{status:'committed',receipt:{available:true}}});const view=render(<UnsubscribeCollection {...props}/>);view.rerender(<UnsubscribeCollection {...props}/>);expect(props.onDone).toHaveBeenCalledOnce();
});
