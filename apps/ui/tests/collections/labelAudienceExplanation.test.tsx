import React from 'react';
import {beforeEach,expect,test,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {LabelAudienceConfirmation} from '@/components/library/sharing/LabelAudienceConfirmation';
import type {CollectionLabelsSnapshot} from '@/lib/collections/labels/model';
import type {LabelOrganizationPlan} from '@/lib/collections/sharing/labelOrganizationContract';

const reads=vi.hoisted(()=>({labels:vi.fn(),catalog:vi.fn(),share:vi.fn()}));
vi.mock('@/lib/collections/labels/client',()=>({requestLabels:reads.labels}));
vi.mock('@/lib/collections/sharing/labelSharingClient',()=>({readLabelSharingCatalog:reads.catalog,readLabelShareState:reads.share}));
const root='75600000-0000-4000-8000-000000000001',child='75600000-0000-4000-8000-000000000002',collection='75600000-0000-4000-8000-000000000003';
const snapshot:CollectionLabelsSnapshot={revision:7,labels:[{id:root,parent_id:null,name:'YouTube',description:null,created_at:'',updated_at:''},{id:child,parent_id:root,name:'Easy Dutch',description:null,created_at:'',updated_at:''}],assignments:[]};
const plan:LabelOrganizationPlan={planId:'75600000-0000-4000-8000-000000000004',audienceRevision:'a'.repeat(64),copyRequired:false,delta:{added:[{userId:'reader',collectionId:collection}],removed:[],pathsChanged:true}};
const collections=[{id:collection,name:'A lesson',type:'user' as const,ownership:'owned' as const}];
type Controller=React.ComponentProps<typeof LabelAudienceConfirmation>['controller'];
function controller(overrides:Partial<Controller>={}):Controller{
 return {state:{userId:'owner',status:'awaiting',plan,planId:plan.planId,error:null},preparedOperation:{type:'set-collection-labels',collection_id:collection,label_ids:[child]},preparedRevision:7,hasPending:false,save:vi.fn(),confirm:vi.fn(),check:vi.fn(),resume:vi.fn(),cancel:vi.fn(),...overrides};
}
beforeEach(()=>{
 vi.clearAllMocks();
 reads.labels.mockResolvedValue(snapshot);
 reads.catalog.mockResolvedValue({owned:[{labelId:root,name:'YouTube',isOpen:true,revision:1,collectionCount:0}],received:[]});
 reads.share.mockResolvedValue({labelId:root,isOpen:true,revision:1,invitationCode:'test',subscriberCount:1});
});

test('names the collection, shared ancestor group and subscriber count before an explicit grant',async()=>{
 const c=controller(),onConfirm=vi.fn(),onCheck=vi.fn();
 render(<LabelAudienceConfirmation controller={c} collections={collections} locale="en" onConfirm={onConfirm} onCheck={onCheck}/>);
 expect(await screen.findByText(/You are adding “A lesson” to shared group “YouTube” \(1 subscriber\)/)).toBeInTheDocument();
 expect(reads.labels).toHaveBeenCalledWith(expect.any(AbortSignal),undefined,'owner');
 expect(reads.share).toHaveBeenCalledWith('owner',root,expect.any(AbortSignal));
 expect(onConfirm).not.toHaveBeenCalled();expect(c.confirm).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Grant access and save'}));
 expect(onConfirm).toHaveBeenCalledOnce();expect(onCheck).not.toHaveBeenCalled();
});

test('a paths-only change describes the group placement but does not invent gained or lost access',async()=>{
 const c=controller({state:{userId:'owner',status:'awaiting',plan:{...plan,delta:{added:[],removed:[],pathsChanged:true}},planId:plan.planId,error:null}});
 const onConfirm=vi.fn();render(<LabelAudienceConfirmation controller={c} collections={collections} locale="en" onConfirm={onConfirm} onCheck={vi.fn()}/>);
 expect(await screen.findByText(/You are adding “A lesson” to shared group “YouTube”/)).toBeInTheDocument();
 expect(screen.getByText('No one gains or loses access. Existing access remains available.')).toBeInTheDocument();
 expect(screen.queryByText('These collections will no longer be available to the affected subscribers')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Remove access and save'})).not.toBeInTheDocument();
 expect(onConfirm).not.toHaveBeenCalled();
});

test('resumed uncertainty without the prepared snapshot context retains check and retry without invented group details',async()=>{
 const onConfirm=vi.fn(),onCheck=vi.fn();
 const c=controller({preparedOperation:null,preparedRevision:null,state:{userId:'owner',status:'uncertain',plan:null,planId:plan.planId,error:null},hasPending:true});
 render(<LabelAudienceConfirmation controller={c} collections={collections} locale="en" onConfirm={onConfirm} onCheck={onCheck}/>);
 expect(screen.getByText('You confirmed this change, but its result could not be verified.')).toBeInTheDocument();
 await waitFor(()=>expect(reads.labels).not.toHaveBeenCalled());expect(reads.catalog).not.toHaveBeenCalled();expect(reads.share).not.toHaveBeenCalled();
 expect(screen.queryByText(/YouTube/)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Check result'}));expect(onCheck).toHaveBeenCalledOnce();expect(onConfirm).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Retry the confirmed change'}));expect(onConfirm).toHaveBeenCalledOnce();
});

test('a stale catalog revision falls back to the prepared audience without inventing group context',async()=>{
 reads.labels.mockResolvedValue({...snapshot,revision:8});
 render(<LabelAudienceConfirmation controller={controller()} collections={collections} locale="en" onConfirm={vi.fn()} onCheck={vi.fn()}/>);
 expect(await screen.findByText('These collections will become available to subscribers of shared labels')).toBeInTheDocument();
 expect(screen.queryByText(/You are adding/)).not.toBeInTheDocument();expect(reads.share).not.toHaveBeenCalled();
});

test('placing a received collection in a personal shared label does not claim transitive publication',async()=>{
 const c=controller({state:{userId:'owner',status:'awaiting',plan:{...plan,delta:{added:[],removed:[],pathsChanged:true}},planId:plan.planId,error:null}});
 render(<LabelAudienceConfirmation controller={c} collections={[{...collections[0],ownership:'received'}]} locale="en" onConfirm={vi.fn()} onCheck={vi.fn()}/>);
 expect(await screen.findByText('No one gains or loses access. Existing access remains available.')).toBeInTheDocument();
 expect(screen.queryByText(/You are adding/)).not.toBeInTheDocument();expect(reads.share).not.toHaveBeenCalled();
});

test('named group context never hides the server plan audience for the same collection',async()=>{
 const serverPlan={...plan,delta:{...plan.delta,added:[{userId:'reader-one',collectionId:collection},{userId:'reader-two',collectionId:collection}]}};
 const c=controller({state:{userId:'owner',status:'awaiting',plan:serverPlan,planId:plan.planId,error:null}});
 const onConfirm=vi.fn();
 render(<LabelAudienceConfirmation controller={c} collections={collections} locale="en" onConfirm={onConfirm} onCheck={vi.fn()}/>);
 expect(await screen.findByText(/You are adding “A lesson” to shared group “YouTube” \(1 subscriber\)/)).toBeInTheDocument();
 expect(screen.getByText('These collections will become available to subscribers of shared labels')).toBeInTheDocument();
 expect(screen.getByRole('listitem')).toHaveTextContent('A lesson · 2 subscribers');
 expect(screen.getByRole('button',{name:'Grant access and save'})).toBeEnabled();
 expect(onConfirm).not.toHaveBeenCalled();
});
