import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({hook:vi.fn(),accept:vi.fn(),reconcile:vi.fn(),retry:vi.fn(),refresh:vi.fn()}));
vi.mock('@/components/library/sharing/useShareInvitation',()=>({useShareInvitation:mock.hook}));
import {InvitationPreview} from '@/components/library/sharing/InvitationPreview';
const preview={name:'Lesson',entryCount:10,alreadyAdded:false,samples:[{headword:'lopen',definition:'Zich te voet voortbewegen.'}]};
const props={userId:'reader',code:'A'.repeat(26),locale:'en' as const,onClose:vi.fn(),onOpen:vi.fn(),onConfirmed:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();mock.hook.mockReturnValue({state:{status:'ready',preview},accept:mock.accept,reconcile:mock.reconcile,retry:mock.retry,refresh:mock.refresh});});
test('shows preview and requires explicit acceptance',()=>{
 render(<InvitationPreview {...props}/>);expect(screen.getByRole('heading',{name:'Lesson'})).toBeInTheDocument();expect(screen.getByText('lopen')).toBeInTheDocument();expect(screen.getByText('Zich te voet voortbewegen.')).toBeInTheDocument();expect(mock.accept).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Add to library'}));expect(mock.accept).toHaveBeenCalledOnce();
});
test('uncertainty exposes explicit check and same-intent retry, keeping cancellation disabled',()=>{
 mock.hook.mockReturnValue({state:{status:'uncertain',preview},reconcile:mock.reconcile,retry:mock.retry});render(<InvitationPreview {...props}/>);
 expect(screen.getByRole('button',{name:'Cancel'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Check result'}));expect(mock.reconcile).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'Retry same request'}));expect(mock.retry).toHaveBeenCalledOnce();expect(mock.accept).not.toHaveBeenCalled();
});
test.each([true,false])('confirmed acceptance consumes pending authority (available=%s)',available=>{
 mock.hook.mockReturnValue({state:{status:'accepted',collectionId:'collection',available}});render(<InvitationPreview {...props}/>);
 expect(props.onConfirmed).toHaveBeenCalledOnce();
 if(available){fireEvent.click(screen.getByRole('button',{name:'View words'}));expect(props.onOpen).toHaveBeenCalledWith('collection',undefined,undefined);}
 else expect(screen.queryByRole('button',{name:'View words'})).not.toBeInTheDocument();
});
