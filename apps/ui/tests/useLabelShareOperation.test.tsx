import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {useLabelShareOperation} from '@/components/library/sharing/useLabelShareOperation';
import * as client from '@/lib/collections/sharing/labelSharingClient';
import type {LabelShareCommand,LabelShareReceipt} from '@/lib/collections/sharing/labelSharingContract';

vi.mock('@/lib/collections/sharing/labelSharingClient',async()=>({...await vi.importActual<typeof client>('@/lib/collections/sharing/labelSharingClient'),executeLabelShareIntent:vi.fn(),reconcileLabelShareIntent:vi.fn()}));
const command:LabelShareCommand={operationId:'11111111-1111-4111-8111-111111111111',action:'open',labelId:'22222222-2222-4222-8222-222222222222',expectedRevision:0};
const receipt:LabelShareReceipt={operationId:command.operationId,status:'rejected',action:'open',reason:'share_revision_conflict'};
const accepts=(value:LabelShareCommand)=>'labelId'in value&&value.labelId===command.labelId;

describe('label sharing operation lifecycle',()=>{
 beforeEach(()=>{sessionStorage.clear();vi.clearAllMocks();});
 it('restores a lost response after remount and reconciles the same operation without resending',async()=>{
  vi.mocked(client.executeLabelShareIntent).mockResolvedValue(null);
  const first=renderHook(()=>useLabelShareOperation('owner','label',accepts));
  await act(()=>first.result.current.execute(command));
  expect(first.result.current.state.status).toBe('uncertain');
  first.unmount();
  const restored=renderHook(()=>useLabelShareOperation('owner','label',accepts));
  await waitFor(()=>expect(restored.result.current.state.status).toBe('uncertain'));
  vi.mocked(client.reconcileLabelShareIntent).mockResolvedValue(receipt);
  await act(()=>restored.result.current.reconcile());
  expect(client.reconcileLabelShareIntent).toHaveBeenCalledWith(expect.objectContaining({userId:'owner',command}),expect.any(AbortSignal));
  expect(client.executeLabelShareIntent).toHaveBeenCalledTimes(1);
  expect(restored.result.current.state.receipt).toEqual(receipt);
  restored.unmount();
  const clean=renderHook(()=>useLabelShareOperation('owner','label',accepts));
  expect(clean.result.current.state.status).toBe('idle');
 });
 it('retries the original command and prevents an uncertain operation from being replaced',async()=>{
  vi.mocked(client.executeLabelShareIntent).mockResolvedValue(null);
  const hook=renderHook(()=>useLabelShareOperation('owner','label',accepts));
  await act(()=>hook.result.current.execute(command));
  await act(()=>hook.result.current.execute({...command,operationId:'33333333-3333-4333-8333-333333333333'}));
  expect(client.executeLabelShareIntent).toHaveBeenCalledTimes(1);
  await act(()=>hook.result.current.retry());
  expect(vi.mocked(client.executeLabelShareIntent).mock.calls[1][0].command).toEqual(command);
 });
 it('hides pending state on account change and ignores the old account response',async()=>{
  let complete!:(value:LabelShareReceipt)=>void;
  vi.mocked(client.executeLabelShareIntent).mockReturnValue(new Promise(resolve=>{complete=resolve;}));
  const hook=renderHook(({user})=>useLabelShareOperation(user,'label',accepts),{initialProps:{user:'owner'}});
  let pending!:Promise<void>;
  act(()=>{pending=hook.result.current.execute(command);});
  expect(hook.result.current.state.status).toBe('saving');
  hook.rerender({user:'viewer'});
  expect(hook.result.current.state.status).toBe('idle');
  await act(async()=>{complete(receipt);await pending;});
  expect(hook.result.current.state.receipt).toBeNull();
  expect(hook.result.current.state.status).toBe('idle');
 });
});
