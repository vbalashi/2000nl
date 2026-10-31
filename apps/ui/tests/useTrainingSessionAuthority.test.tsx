import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useTrainingSessionAuthority, useTrainingSessionAuthorityEvents, type TrainingAuthorityRead } from "@/components/training/useTrainingSessionAuthority";
const hints=vi.hoisted(()=>({owner:vi.fn(),changed:vi.fn()}));
vi.mock("@/lib/training/sessionResumeStore",()=>({
  subscribeTrainingSessionInvalidation:(_user:string,callback:()=>void)=>{hints.changed.mockImplementation(callback);return vi.fn();},
  subscribeTrainingSessionOwnerInvalidation:(callback:()=>void)=>{hints.owner.mockImplementation(callback);return vi.fn();},
}));
function deferred<T>() { let resolve!:(value:T)=>void, reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; }
beforeEach(()=>{vi.clearAllMocks();});
afterEach(()=>{vi.useRealTimers();});
function setup(read=vi.fn<[],Promise<TrainingAuthorityRead>>().mockResolvedValue({kind:"active"})) {
  const replaced=vi.fn();
  const hook=renderHook(({visible,returned}:{visible:boolean;returned:boolean})=>{
    const authority=useTrainingSessionAuthority({userId:"user",read,onSuperseded:replaced});
    useTrainingSessionAuthorityEvents(authority,{userId:"user",sessionId:authority.ownerToken.sessionId,visible,returned});
    return authority;
  },{initialProps:{visible:true,returned:false}});
  act(()=>hook.result.current.reset("run-a"));
  return {...hook,read,replaced};
}
test("authority reads fence actions until the current response succeeds",async()=>{
  const response=deferred<TrainingAuthorityRead>();const hook=setup(vi.fn().mockReturnValue(response.promise));let check!:Promise<boolean>;
  act(()=>{check=hook.result.current.validate();});expect(hook.result.current.checking).toBe(true);expect(hook.result.current.refreshing).toBe(true);
  await act(async()=>{response.resolve({kind:"active"});expect(await check).toBe(true);});
  expect(hook.result.current.checking).toBe(false);
});
test.each(["active","superseded"] as const)("late %s response cannot change a successor, including same-ID reuse",async(kind)=>{
  const response=deferred<TrainingAuthorityRead>();const hook=setup(vi.fn().mockReturnValue(response.promise));let check!:Promise<boolean>;
  act(()=>{check=hook.result.current.validate();});act(()=>hook.result.current.reset("run-a"));
  await act(async()=>{response.resolve({kind});expect(await check).toBe(false);});
  expect(hook.replaced).not.toHaveBeenCalled();expect(hook.result.current.checking).toBe(false);
});
test("offline invalidates a pending positive read and reconnect must validate again",async()=>{
  const old=deferred<TrainingAuthorityRead>();const read=vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue({kind:"active"});const hook=setup(read);let check!:Promise<boolean>;
  act(()=>{check=hook.result.current.validate();});act(()=>window.dispatchEvent(new Event("offline")));
  await act(async()=>{old.resolve({kind:"active"});expect(await check).toBe(false);});
  expect(hook.result.current.checking).toBe(true);expect(hook.result.current.refreshing).toBe(false);
  act(()=>window.dispatchEvent(new Event("online")));await waitFor(()=>expect(hook.result.current.checking).toBe(false));expect(read).toHaveBeenCalledTimes(2);
});
test("transport failure keeps authority blocked until a successful explicit retry",async()=>{
  const hook=setup(vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({kind:"active"}));
  await act(async()=>{expect(await hook.result.current.validate()).toBe(false);});expect(hook.result.current.checking).toBe(true);
  await act(async()=>{expect(await hook.result.current.validate()).toBe(true);});expect(hook.result.current.checking).toBe(false);
});
test("concurrent validations reconcile one revision once and only the current check commits",async()=>{
  const loaded=deferred<boolean>();const reconcile=vi.fn(()=>loaded.promise),commit=vi.fn();
  const hook=setup(vi.fn().mockResolvedValue({kind:"replan",revision:2,reconcile,commit}));let first!:Promise<boolean>,second!:Promise<boolean>;
  act(()=>{first=hook.result.current.validate();});await waitFor(()=>expect(reconcile).toHaveBeenCalledOnce());
  act(()=>{second=hook.result.current.validate();});await act(async()=>{await Promise.resolve();});expect(reconcile).toHaveBeenCalledOnce();
  await act(async()=>{loaded.resolve(true);expect(await first).toBe(false);expect(await second).toBe(true);});expect(commit).toHaveBeenCalledOnce();
});
test.each([true,false])("a replaced run cannot commit a late replan result (%s)",async(loaded)=>{
  const result=deferred<boolean>();const reconcile=vi.fn(()=>result.promise),commit=vi.fn();
  const hook=setup(vi.fn().mockResolvedValue({kind:"replan",revision:2,reconcile,commit}));let check!:Promise<boolean>;
  act(()=>{check=hook.result.current.validate();});await waitFor(()=>expect(reconcile).toHaveBeenCalledOnce());act(()=>hook.result.current.reset("run-b"));
  await act(async()=>{result.resolve(loaded);expect(await check).toBe(false);});expect(commit).not.toHaveBeenCalled();expect(hook.result.current.checking).toBe(false);
});
test("unmount fences pending validation callbacks",async()=>{
  const response=deferred<TrainingAuthorityRead>();const hook=setup(vi.fn().mockReturnValue(response.promise));let check!:Promise<boolean>;
  act(()=>{check=hook.result.current.validate();});hook.unmount();await act(async()=>{response.resolve({kind:"superseded"});expect(await check).toBe(false);});expect(hook.replaced).not.toHaveBeenCalled();
});
test("a same-ID replacement rebinds return and owner-invalidation listeners",async()=>{
  const hook=setup();act(()=>hook.result.current.reset("run-a"));act(()=>window.dispatchEvent(new Event("focus")));
  await waitFor(()=>expect(hook.read).toHaveBeenCalledOnce());act(()=>hints.owner());expect(hook.replaced).toHaveBeenCalledOnce();
});
test("visible polling checks authority without a learner action and stops when hidden",async()=>{
  vi.useFakeTimers();const hook=setup();await act(async()=>{await vi.advanceTimersByTimeAsync(20_000);});expect(hook.read).toHaveBeenCalledOnce();
  hook.rerender({visible:false,returned:false});await act(async()=>{await vi.advanceTimersByTimeAsync(40_000);});expect(hook.read).toHaveBeenCalledOnce();
});

test("changing accounts rejects the predecessor read and cannot validate its bound run",async()=>{
  const response=deferred<TrainingAuthorityRead>();const read=vi.fn(()=>response.promise),replaced=vi.fn();
  const hook=renderHook(({userId})=>useTrainingSessionAuthority({userId,read,onSuperseded:replaced}),{initialProps:{userId:"old-user"}});
  act(()=>hook.result.current.reset("old-run"));let check!:Promise<boolean>;
  act(()=>{check=hook.result.current.validate();});hook.rerender({userId:"new-user"});
  await act(async()=>{response.resolve({kind:"superseded"});expect(await check).toBe(false);});
  await act(async()=>{expect(await hook.result.current.validate()).toBe(false);});
  expect(read).toHaveBeenCalledOnce();expect(replaced).not.toHaveBeenCalled();
});
test("a failed replan stays fenced and can be recovered by another read",async()=>{
  const reconcile=vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true),commit=vi.fn();
  const hook=setup(vi.fn().mockResolvedValue({kind:"replan",revision:2,reconcile,commit}));
  await act(async()=>{expect(await hook.result.current.validate()).toBe(false);});expect(hook.result.current.checking).toBe(true);expect(commit).not.toHaveBeenCalled();
  await act(async()=>{expect(await hook.result.current.validate()).toBe(true);});expect(hook.result.current.checking).toBe(false);expect(commit).toHaveBeenCalledOnce();
});
