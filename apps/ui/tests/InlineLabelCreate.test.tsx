import React from 'react';
import {afterEach,expect,test,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {InlineLabelCreate} from '@/components/library/organization/InlineLabelCreate';
const {request,prepare,confirm,retain,clear}=vi.hoisted(()=>({request:vi.fn(),prepare:vi.fn(),confirm:vi.fn(),retain:vi.fn(()=>true),clear:vi.fn()}));
vi.mock('@/lib/collections/sharing/labelOrganizationClient',()=>({prepareLabelOrganization:prepare,confirmLabelOrganization:confirm}));
vi.mock('@/lib/collections/sharing/labelOrganizationJournal',()=>({readLabelOrganizationJournal:()=>null,retainLabelOrganizationJournal:retain,clearLabelOrganizationJournal:clear}));
vi.mock('@/lib/collections/sharing/labelSharingJournal',()=>({labelSharingStore:()=>({})}));
vi.mock('@/lib/collections/labels/client',()=>({requestLabels:request}));
afterEach(()=>{cleanup();request.mockReset();prepare.mockReset();confirm.mockReset();retain.mockClear();clear.mockClear();vi.unstubAllEnvs();});
const empty={revision:1,labels:[],assignments:[]};
test('creates from an empty catalog and returns the new revision without submitting its parent form',async()=>{
 const created=vi.fn(),submitted=vi.fn();request.mockResolvedValueOnce({...empty,revision:4}).mockImplementationOnce((_signal,body)=>Promise.resolve({...empty,revision:5,labels:[{id:body.operation.id,name:'New label'}]}));
 render(<form onSubmit={event=>{event.preventDefault();submitted();}}><InlineLabelCreate userId="owner" snapshot={empty} locale="en" onCreated={created}/></form>);
 fireEvent.click(screen.getByRole('button',{name:'New label'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'New label'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(created).toHaveBeenCalledOnce());expect(submitted).not.toHaveBeenCalled();expect(request.mock.calls[1][1]).toMatchObject({expectedRevision:4,operation:{type:'create',name:'New label',parent_id:null}});expect(created.mock.calls[0][0].revision).toBe(5);
});
test('reconciles an uncertain create by its stable identity without creating a duplicate',async()=>{
 const created=vi.fn();let id='';request.mockResolvedValueOnce(empty).mockImplementationOnce((_signal,body)=>{id=body.operation.id;return Promise.reject(new Error('lost response'));});
 render(<InlineLabelCreate userId="owner" snapshot={empty} locale="en" onCreated={created}/>);fireEvent.click(screen.getByRole('button',{name:'New label'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'New label'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByRole('alert');
 request.mockResolvedValueOnce({...empty,revision:2,labels:[{id,name:'New label'}]});fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await waitFor(()=>expect(created).toHaveBeenCalledOnce());expect(request).toHaveBeenCalledTimes(3);expect(created.mock.calls[0][1]).toBe(id);
});

test('sharing-enabled create retains its plan before confirmation and never uses legacy mutation',async()=>{
 vi.stubEnv('NEXT_PUBLIC_LABEL_SHARING_ENABLED','true');const created=vi.fn();let id='';request.mockResolvedValue(empty);prepare.mockImplementation((_user,input)=>{id=input.operation.id;return Promise.resolve({planId:'plan',copyRequired:false,delta:{pathsChanged:false,added:[],removed:[]}});});confirm.mockImplementation(()=>Promise.resolve({...empty,revision:2,labels:[{id,name:'New label'}]}));
 render(<InlineLabelCreate userId="owner" snapshot={empty} locale="en" onCreated={created}/>);fireEvent.click(screen.getByRole('button',{name:'New label'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'New label'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(created).toHaveBeenCalledOnce());expect(request).toHaveBeenCalledTimes(1);expect(confirm).toHaveBeenCalledOnce();expect(retain.mock.invocationCallOrder[0]).toBeLessThan(confirm.mock.invocationCallOrder[0]);expect(clear).toHaveBeenCalledWith(expect.anything(),'owner','plan');
});
