import React from 'react';
import {afterEach,expect,test,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {InlineLabelCreate} from '@/components/library/organization/InlineLabelCreate';
const {request,prepare,confirm,retain,clear,receipt}=vi.hoisted(()=>({request:vi.fn(),prepare:vi.fn(),confirm:vi.fn(),retain:vi.fn(()=>true),clear:vi.fn(),receipt:vi.fn()}));
vi.mock('@/lib/collections/sharing/labelOrganizationClient',()=>({prepareLabelOrganization:prepare,confirmLabelOrganization:confirm,readLabelOrganizationReceipt:receipt}));
vi.mock('@/lib/collections/sharing/labelOrganizationJournal',()=>({readLabelOrganizationJournal:()=>null,retainLabelOrganizationJournal:retain,clearLabelOrganizationJournal:clear}));
vi.mock('@/lib/collections/sharing/labelSharingJournal',()=>({labelSharingStore:()=>window.sessionStorage}));
vi.mock('@/lib/collections/labels/client',()=>({requestLabels:request}));
afterEach(()=>{cleanup();request.mockReset();prepare.mockReset();confirm.mockReset();retain.mockClear();clear.mockClear();receipt.mockReset();sessionStorage.clear();vi.unstubAllEnvs();});
const empty={revision:1,labels:[],assignments:[]};
test('creates from an empty catalog and returns the new revision without submitting its parent form',async()=>{
 const created=vi.fn(),submitted=vi.fn();request.mockResolvedValueOnce(empty).mockImplementationOnce((_signal,body)=>Promise.resolve({...empty,revision:2,labels:[{id:body.operation.id,name:'New label'}]}));
 render(<form onSubmit={event=>{event.preventDefault();submitted();}}><InlineLabelCreate userId="owner" scope="lesson" snapshot={empty} locale="en" onCreated={created}/></form>);
 fireEvent.click(screen.getByRole('button',{name:'New label'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'New label'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(created).toHaveBeenCalledOnce());expect(submitted).not.toHaveBeenCalled();expect(request.mock.calls[1][1]).toMatchObject({expectedRevision:1,operation:{type:'create',name:'New label',parent_id:null}});expect(created.mock.calls[0][0].revision).toBe(2);
});
test('reconciles an uncertain create by its stable identity without creating a duplicate',async()=>{
 const created=vi.fn();let id='';request.mockResolvedValueOnce(empty).mockImplementationOnce((_signal,body)=>{id=body.operation.id;return Promise.reject(new Error('lost response'));});
 render(<InlineLabelCreate userId="owner" scope="lesson" snapshot={empty} locale="en" onCreated={created}/>);fireEvent.click(screen.getByRole('button',{name:'New label'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'New label'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByRole('alert');
 request.mockResolvedValueOnce({...empty,revision:2,labels:[{id,name:'New label'}]});fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await waitFor(()=>expect(created).toHaveBeenCalledOnce());expect(request).toHaveBeenCalledTimes(3);expect(created.mock.calls[0][1]).toBe(id);
});

test('sharing-enabled create retains its plan before confirmation and never uses legacy mutation',async()=>{
 vi.stubEnv('NEXT_PUBLIC_LABEL_SHARING_ENABLED','true');const created=vi.fn();let id='';request.mockResolvedValue(empty);prepare.mockImplementation((_user,input)=>{id=input.operation.id;return Promise.resolve({planId:'75600000-0000-4000-8000-000000000009',copyRequired:false,delta:{pathsChanged:false,added:[],removed:[]}});});confirm.mockImplementation(()=>Promise.resolve({...empty,revision:2,labels:[{id,name:'New label'}]}));
 render(<InlineLabelCreate userId="owner" scope="lesson" snapshot={empty} locale="en" onCreated={created}/>);fireEvent.click(screen.getByRole('button',{name:'New label'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'New label'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(created).toHaveBeenCalledOnce());expect(request).toHaveBeenCalledTimes(1);expect(confirm).toHaveBeenCalledOnce();expect(retain.mock.invocationCallOrder[0]).toBeLessThan(confirm.mock.invocationCallOrder[0]);expect(clear).toHaveBeenCalledWith(expect.anything(),'owner','75600000-0000-4000-8000-000000000009');
});

test('uncertain plan keeps its identity through Cancel and remount',async()=>{
 vi.stubEnv('NEXT_PUBLIC_LABEL_SHARING_ENABLED','true');const created=vi.fn();let id='';request.mockResolvedValue(empty);prepare.mockImplementation((_user,input)=>{id=input.operation.id;return Promise.resolve({planId:'75600000-0000-4000-8000-000000000009',copyRequired:false,delta:{pathsChanged:false,added:[],removed:[]}});});confirm.mockRejectedValueOnce(new Error('lost response'));
 const first=render(<InlineLabelCreate userId="owner" scope="lesson" snapshot={empty} locale="en" onCreated={created}/>);fireEvent.click(screen.getByRole('button',{name:'New label'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Original'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Cancel'}));first.unmount();
 receipt.mockResolvedValue({status:'committed',result:{...empty,revision:2,labels:[{id,name:'Original'}]}});render(<InlineLabelCreate userId="owner" scope="lesson" snapshot={empty} locale="en" onCreated={created}/>);expect(screen.getByLabelText('Name')).toHaveValue('Original');expect(screen.getByLabelText('Name')).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await waitFor(()=>expect(created).toHaveBeenCalledOnce());expect(created.mock.calls[0][1]).toBe(id);expect(prepare).toHaveBeenCalledOnce();expect(confirm).toHaveBeenCalledOnce();
});
test('concurrent assignment revision is not silently adopted by creation',async()=>{
 const created=vi.fn();request.mockResolvedValue({...empty,revision:8});render(<InlineLabelCreate userId="owner" scope="lesson" snapshot={empty} locale="en" onCreated={created}/>);fireEvent.click(screen.getByRole('button',{name:'New label'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'New label'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByRole('alert');expect(created).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();expect(request).toHaveBeenCalledTimes(1);
});

test('confirmed legacy create followed by another edit can leave conflict without rebasing or blocking future creates',async()=>{
 const created=vi.fn();let id='';request.mockResolvedValueOnce(empty).mockImplementationOnce((_signal,input)=>{id=input.operation.id;return Promise.reject(new Error('lost'));});render(<InlineLabelCreate userId="owner" scope="lesson" snapshot={empty} locale="en" onCreated={created}/>);fireEvent.click(screen.getByRole('button',{name:'New label'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Original'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByRole('alert');request.mockResolvedValueOnce({...empty,revision:5,labels:[{id,name:'Original'}]});fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('changed'));expect(created).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Cancel'}));fireEvent.click(screen.getByRole('button',{name:'New label'}));expect(screen.getByLabelText('Name')).toBeEnabled();expect(screen.getByLabelText('Name')).toHaveValue('');
});
