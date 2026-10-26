import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({hook:vi.fn(),run:vi.fn(),refresh:vi.fn()}));
vi.mock('@/components/library/sharing/useOwnedCollectionSharing',()=>({useOwnedCollectionSharing:mock.hook}));
vi.mock('@/components/practice/ui/DialogSurface',()=>({DialogSurface:({children}:{children:React.ReactNode})=><div role="dialog">{children}</div>}));
import {OwnedCollectionSharing} from '@/components/library/sharing/OwnedCollectionSharing';
const id='75600000-0000-4000-8000-000000000001',code='A'.repeat(26);
const data={collectionId:id,isOpen:true,revision:1,invitationCode:code,subscriberCount:2};
const props={userId:'owner',collectionId:id,name:'Lesson',locale:'en' as const,onClose:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();mock.hook.mockReturnValue({state:{status:'ready',data},run:mock.run,refresh:mock.refresh});});
test('same code appears in both invitation forms and merely opening settings never mutates',()=>{
 render(<OwnedCollectionSharing {...props}/>);expect(screen.getByRole('textbox',{name:'Copy link'})).toHaveValue(`${window.location.origin}/share#${code}`);expect(screen.getByRole('textbox',{name:'Copy code'})).toHaveValue(code);expect(mock.run).not.toHaveBeenCalled();
});
test('owner dialog renders during server pass without reading browser location',()=>{
 vi.stubGlobal('window',undefined);
 try{const html=renderToString(<OwnedCollectionSharing {...props}/>);expect(html).not.toContain('Create view-only link');}
 finally{vi.unstubAllGlobals();}
});
test('rotation and closing require their own explicit confirmation, with distinct consequences',()=>{
 render(<OwnedCollectionSharing {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Replace link'}));expect(screen.getByText(/Existing subscribers keep access/)).toBeInTheDocument();expect(mock.run).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Cancel'}));fireEvent.click(screen.getByRole('button',{name:'Close shared access'}));expect(screen.getByText(/Subscribers lose this shared access/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Confirm'}));expect(mock.run).toHaveBeenCalledWith('close');
});
test('uncertainty shows no stale code, permits read-only check and local dismissal',()=>{
 mock.hook.mockReturnValue({state:{status:'uncertain',data:null},run:mock.run});render(<OwnedCollectionSharing {...props}/>);expect(screen.queryByRole('textbox')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Check result'}));expect(mock.run).toHaveBeenCalledWith('check');fireEvent.click(screen.getByRole('button',{name:'Close'}));expect(props.onClose).toHaveBeenCalledOnce();
});
