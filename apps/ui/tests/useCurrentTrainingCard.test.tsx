import { useLayoutEffect } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useCurrentTrainingCard, usePresentedTrainingCard, type PresentedTrainingCard } from "@/components/training/v2/useCurrentTrainingCard";
import type { CurrentTrainingCardPermit, CurrentTrainingCardTarget } from "@/lib/platform/trainingCurrentCardClient";
const { acknowledge } = vi.hoisted(() => ({acknowledge:vi.fn()}));
vi.mock("@/lib/platform/trainingCurrentCardClient",()=>({acknowledgeCurrentTrainingCard:acknowledge}));
const target:CurrentTrainingCardTarget={sessionId:"run",entryId:"entry",cardTypeId:"word-to-definition",sourceVersion:1,stateRevision:"state"};
const permit=():CurrentTrainingCardPermit=>({permitId:"75300000-0000-4000-8000-000000000001",expiresAt:new Date(Date.now()+60_000).toISOString(),runGeneration:1});
beforeEach(()=>{vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED","true");acknowledge.mockReset().mockImplementation(async()=>permit());});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
test("flag off and inactive presentation never acknowledge a prefetched target",async()=>{
 vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED","false");
 const first=renderHook(()=>useCurrentTrainingCard({userId:"owner",target,active:true}));
 expect(first.result.current.ready).toBe(true);expect(acknowledge).not.toHaveBeenCalled();first.unmount();
 vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED","true");
 const second=renderHook(()=>useCurrentTrainingCard({userId:"owner",target,active:false}));
 expect(second.result.current.ready).toBe(false);expect(acknowledge).not.toHaveBeenCalled();
});
test("only a visible selected presentation acknowledges; hiding retains its bounded permit without renewing",async()=>{
 let visible=false;vi.spyOn(document,"visibilityState","get").mockImplementation(()=>visible?"visible":"hidden");
 const view=renderHook(({active})=>useCurrentTrainingCard({userId:"owner",target,active}),{initialProps:{active:true}});
 expect(acknowledge).not.toHaveBeenCalled();
 act(()=>{visible=true;document.dispatchEvent(new Event("visibilitychange"));});
 await waitFor(()=>expect(view.result.current.ready).toBe(true));
 expect(acknowledge).toHaveBeenCalledOnce();
 view.rerender({active:false});expect(view.result.current.context).toBeUndefined();
 view.rerender({active:true});expect(view.result.current.ready).toBe(true);expect(acknowledge).toHaveBeenCalledOnce();
});
test("a target or account change aborts and fences the previous acknowledgement",async()=>{
 const releases:Array<(permit:CurrentTrainingCardPermit)=>void>=[];
 acknowledge.mockImplementation(()=>new Promise<CurrentTrainingCardPermit>(resolve=>releases.push(resolve)));
 const view=renderHook(({userId,entryId})=>useCurrentTrainingCard({userId,target:{...target,entryId},active:true}),{initialProps:{userId:"a",entryId:"first"}});
 await waitFor(()=>expect(releases).toHaveLength(1));
 const signal=acknowledge.mock.calls[0][2] as AbortSignal;
 view.rerender({userId:"b",entryId:"second"});expect(signal.aborted).toBe(true);
 await waitFor(()=>expect(releases).toHaveLength(2));
 await act(async()=>{releases[0](permit());});expect(view.result.current.ready).toBe(false);
 await act(async()=>{releases[1](permit());});expect(view.result.current.ready).toBe(true);
 expect(acknowledge.mock.calls[1][0]).toBe("b");expect(acknowledge.mock.calls[1][1].entryId).toBe("second");
});
test("missing source version fails closed; an explicit retry reconciles a failed acknowledgement",async()=>{
 const invalid=renderHook(()=>useCurrentTrainingCard({userId:"owner",target:{...target,sourceVersion:0},active:true}));
 await waitFor(()=>expect(invalid.result.current.failed).toBe(true));expect(acknowledge).not.toHaveBeenCalled();invalid.unmount();
 acknowledge.mockRejectedValueOnce(new Error("offline"));
 const view=renderHook(()=>useCurrentTrainingCard({userId:"owner",target,active:true}));
 await waitFor(()=>expect(view.result.current.failed).toBe(true));expect(view.result.current.context).toBeUndefined();
 act(()=>view.result.current.retry());await waitFor(()=>expect(view.result.current.ready).toBe(true));expect(acknowledge).toHaveBeenCalledTimes(2);
});
test("expiry removes the current exception and does not silently renew it",async()=>{
 vi.useFakeTimers();
 try{
  acknowledge.mockResolvedValue({...permit(),expiresAt:new Date(Date.now()+1_000).toISOString()});
  const view=renderHook(()=>useCurrentTrainingCard({userId:"owner",target,active:true}));
  await act(async()=>{await Promise.resolve();});
  expect(view.result.current.ready).toBe(true);
  await act(async()=>{await vi.advanceTimersByTimeAsync(1_001);});
  expect(view.result.current.failed).toBe(true);expect(view.result.current.context).toBeUndefined();expect(acknowledge).toHaveBeenCalledOnce();
 }finally{vi.useRealTimers();}
});

test("More bridge retains exact presentation identity and clears when presentation leaves", () => {
 const changed=vi.fn();
 const presented={userId:"owner",group:{headwordGroupId:"group"},entry:{entryId:"entry"},currentCard:{sessionId:"run",permitId:permit().permitId}} as PresentedTrainingCard;
 const view=renderHook(({value}:{value:PresentedTrainingCard|null})=>usePresentedTrainingCard(value,changed),{initialProps:{value:presented as PresentedTrainingCard|null}});
 expect(changed).toHaveBeenLastCalledWith(presented);
 changed.mockClear();
 view.rerender({value:{...presented}});
 expect(changed).not.toHaveBeenCalled();
 view.rerender({value:null});
 expect(changed).toHaveBeenLastCalledWith(null);
 view.rerender({value:{...presented,userId:"other"}});
 expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({userId:"other"}));
 view.unmount();
 expect(changed).toHaveBeenLastCalledWith(null);
});

test("display acknowledgement starts at committed layout without a redundant loading render", () => {
 acknowledge.mockImplementation(() => new Promise(() => {}));
 let renders=0;
 const acknowledgementsAtLayout:number[]=[];
 const view=renderHook(({entryId})=>{
  renders++;
  const value=useCurrentTrainingCard({userId:"owner",target:{...target,entryId},active:true});
  useLayoutEffect(()=>{acknowledgementsAtLayout.push(acknowledge.mock.calls.length);},[entryId]);
  return value;
 },{initialProps:{entryId:"first"}});
 expect(acknowledgementsAtLayout).toEqual([1]);
 expect(renders).toBe(1);
 expect(view.result.current.ready).toBe(false);
 view.rerender({entryId:"second"});
 expect(acknowledgementsAtLayout).toEqual([1,2]);
 expect(renders).toBe(2);
 expect((acknowledge.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
});


test("an active presentation without a session target fails instead of waiting for an unstarted request", () => {
 const view=renderHook(()=>useCurrentTrainingCard({userId:"owner",target:null,active:true}));
 expect(view.result.current.ready).toBe(false);
 expect(view.result.current.failed).toBe(true);
 expect(acknowledge).not.toHaveBeenCalled();
});
