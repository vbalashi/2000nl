import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({read:vi.fn(),clipboard:vi.fn(),hint:undefined as undefined|(()=>Promise<void>)}));
vi.mock('@/lib/collections/sharing/shareManagementClient',()=>({readCollectionShareForward:mock.read}));
vi.mock('@/lib/events/userEventHints',()=>({useUserEventHints:(_u:unknown,_k:unknown,refresh:()=>Promise<void>)=>{mock.hint=refresh;}}));
vi.mock('@/components/practice/ui/DialogSurface',()=>({DialogSurface:({children}:{children:React.ReactNode})=><div role="dialog">{children}</div>}));
import {ForwardCollection} from '@/components/library/sharing/ReceivedCollectionActions';
const id='75600000-0000-4000-8000-000000000001',code='A'.repeat(26);
const row={id,name:'Lesson',createdAt:'2026-01-01T00:00:00Z',addedAt:'2026-01-01T00:00:00Z',ownerUserId:id,role:'viewer' as const,itemCount:2,labelIds:[]};
const props={userId:'reader',row,locale:'en' as const,onClose:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();mock.read.mockResolvedValue({collectionId:id,canForward:true,invitationCode:code});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:mock.clipboard}});mock.clipboard.mockResolvedValue(undefined);});
test('forwards one original code in both link and standalone form, never minting an owner code',async()=>{
 render(<ForwardCollection {...props}/>);const input=await screen.findByRole('textbox',{name:'Invitation link'});expect(input).toHaveValue(`${window.location.origin}/share#${code}`);expect(screen.getByRole('textbox',{name:'Invitation code'})).toHaveValue(code);
 fireEvent.click(screen.getByRole('button',{name:'Copy link'}));await waitFor(()=>expect(mock.clipboard).toHaveBeenCalledWith(`${window.location.origin}/share#${code}`));
 expect(mock.read).toHaveBeenCalledWith('reader',id,expect.any(AbortSignal));
});
test('rotation/revocation hint removes stale code before the refresh completes',async()=>{
 render(<ForwardCollection {...props}/>);await screen.findByRole('textbox',{name:'Invitation code'});
 let resolve!:(v:unknown)=>void;mock.read.mockReturnValue(new Promise(r=>resolve=r));let pending:Promise<void>;act(()=>{pending=mock.hint!();});expect(screen.queryByRole('textbox',{name:'Invitation code'})).not.toBeInTheDocument();
 await act(async()=>{resolve({collectionId:id,canForward:false,invitationCode:null});await pending;});expect(screen.getByRole('alert')).toHaveTextContent('can no longer be forwarded');expect(mock.clipboard).not.toHaveBeenCalled();
});
test('a failed authoritative read never falls back to an old owner link',async()=>{
 mock.read.mockRejectedValue(new Error('revoked'));render(<ForwardCollection {...props}/>);await screen.findByRole('alert');expect(screen.queryByRole('button',{name:'Copy link'})).not.toBeInTheDocument();
});
