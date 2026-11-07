import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,it,expect,vi} from 'vitest';
import {useLabelOrganizationPlan} from '@/components/library/sharing/useLabelOrganizationPlan';
import * as client from '@/lib/collections/sharing/labelOrganizationClient';
import {labelOrganizationJournalKey} from '@/lib/collections/sharing/labelOrganizationJournal';
import type {LabelOrganizationPlan} from '@/lib/collections/sharing/labelOrganizationContract';

vi.mock('@/lib/collections/sharing/labelOrganizationClient',()=>({prepareLabelOrganization:vi.fn(),confirmLabelOrganization:vi.fn(),readLabelOrganizationReceipt:vi.fn()}));
const id='11111111-1111-4111-8111-111111111111',collectionId='22222222-2222-4222-8222-222222222222';
const plan:LabelOrganizationPlan={planId:id,audienceRevision:'a'.repeat(64),delta:{added:[{userId:'33333333-3333-4333-8333-333333333333',collectionId}],removed:[],pathsChanged:true},copyRequired:false};
const operation={type:'set-collection-labels' as const,collection_id:collectionId,label_ids:[]};
const snapshot={revision:2,labels:[],assignments:[]};
beforeEach(()=>{sessionStorage.clear();vi.clearAllMocks();vi.mocked(client.prepareLabelOrganization).mockResolvedValue(plan);});

it('prepares without writing or persisting consent, and confirms only after an explicit action',async()=>{
 const saved=vi.fn(),hook=renderHook(()=>useLabelOrganizationPlan('owner',saved));
 await act(()=>hook.result.current.save(1,operation));
 expect(hook.result.current.state.status).toBe('awaiting');
 expect(client.confirmLabelOrganization).not.toHaveBeenCalled();
 expect(sessionStorage.getItem(labelOrganizationJournalKey('owner'))).toBeNull();
 vi.mocked(client.confirmLabelOrganization).mockResolvedValue(snapshot);
 await act(()=>hook.result.current.confirm());
 expect(client.confirmLabelOrganization).toHaveBeenCalledWith('owner',id,expect.any(AbortSignal));
 expect(saved).toHaveBeenCalledWith(snapshot);
 expect(sessionStorage.getItem(labelOrganizationJournalKey('owner'))).toBeNull();
});

it('restores consent after a lost response; read-check never executes a pending plan; retry uses the same plan',async()=>{
 vi.mocked(client.confirmLabelOrganization).mockRejectedValue(Error('offline'));
 const first=renderHook(()=>useLabelOrganizationPlan('owner',vi.fn()));
 await act(()=>first.result.current.save(1,operation));await act(()=>first.result.current.confirm());
 expect(first.result.current.state.status).toBe('uncertain');first.unmount();
 const saved=vi.fn(),restored=renderHook(()=>useLabelOrganizationPlan('owner',saved));
 await waitFor(()=>expect(restored.result.current.state.status).toBe('uncertain'));
 vi.mocked(client.readLabelOrganizationReceipt).mockResolvedValue({planId:id,status:'pending'});
 await act(()=>restored.result.current.check());
 expect(client.confirmLabelOrganization).toHaveBeenCalledTimes(1);expect(saved).not.toHaveBeenCalled();
 expect(restored.result.current.state.status).toBe('uncertain');
 vi.mocked(client.confirmLabelOrganization).mockResolvedValue(snapshot);
 await act(()=>restored.result.current.confirm());
 expect(vi.mocked(client.confirmLabelOrganization).mock.calls[1][1]).toBe(id);
 expect(saved).toHaveBeenCalledWith(snapshot);
});

it('accepts an authoritative committed receipt without replaying a write',async()=>{
 sessionStorage.setItem(labelOrganizationJournalKey('owner'),JSON.stringify({userId:'owner',planId:id}));
 vi.mocked(client.readLabelOrganizationReceipt).mockResolvedValue({planId:id,status:'committed',result:snapshot});
 const saved=vi.fn(),hook=renderHook(()=>useLabelOrganizationPlan('owner',saved));
 await act(()=>hook.result.current.check());
 expect(client.confirmLabelOrganization).not.toHaveBeenCalled();expect(saved).toHaveBeenCalledWith(snapshot);
});

it('does not commit a delayed response after an account change',async()=>{
 let resolve!:(value:typeof snapshot)=>void;
 vi.mocked(client.confirmLabelOrganization).mockReturnValue(new Promise(done=>{resolve=done;}));
 const saved=vi.fn(),hook=renderHook(({userId})=>useLabelOrganizationPlan(userId,saved),{initialProps:{userId:'owner'}});
 await act(()=>hook.result.current.save(1,operation));
 let pending!:Promise<boolean>;act(()=>{pending=hook.result.current.confirm();});
 hook.rerender({userId:'viewer'});
 await act(async()=>{resolve(snapshot);await pending;});
 expect(saved).not.toHaveBeenCalled();expect(hook.result.current.state.status).toBe('idle');
 expect(sessionStorage.getItem(labelOrganizationJournalKey('owner'))).not.toBeNull();
});

it('does not ask for a second confirmation when the prepared change affects no audience',async()=>{
 vi.mocked(client.prepareLabelOrganization).mockResolvedValue({...plan,delta:{added:[],removed:[],pathsChanged:false}});
 vi.mocked(client.confirmLabelOrganization).mockResolvedValue(snapshot);
 const saved=vi.fn(),hook=renderHook(()=>useLabelOrganizationPlan('owner',saved));
 await act(()=>hook.result.current.save(1,operation));
 expect(hook.result.current.state.status).toBe('idle');expect(saved).toHaveBeenCalledWith(snapshot);
});
