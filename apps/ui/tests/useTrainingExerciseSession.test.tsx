import {act,renderHook,waitFor} from "@testing-library/react";
import {expect,test,vi} from "vitest";
import {useTrainingExerciseSession,type ExerciseNext,type ExercisePreparation} from "@/components/training/useTrainingExerciseSession";
type C={targetId:string;targetKey:string;entryId:string};type Content={text:string};
const candidate={status:"ready" as const,ordinal:1,targetId:"one",targetKey:"one",entryId:"entry-one"};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};}
function setup(){
 const next=vi.fn<[],Promise<ExerciseNext<C>>>().mockResolvedValue(candidate);
 const prepare=vi.fn<[C,AbortSignal,boolean],Promise<ExercisePreparation<Content>>>().mockResolvedValue({state:"ready",content:{text:"example"}});
 const mark=vi.fn().mockResolvedValue({}),actClient=vi.fn().mockResolvedValue({}),progress=vi.fn(),replaced=vi.fn();
 const adapter={next,capturePreparation:()=>prepare,markUnavailable:mark,act:actClient,timing:{selection:"next-card.selection" as const,preparation:"next-card.lookup" as const}};
 const hook=renderHook(({id,language})=>useTrainingExerciseSession({identity:id,preparationIdentity:language,
  session:{sessionId:id,completedActions:0,plannedTotal:5},adapter,onProgress:progress,onSuperseded:replaced}),{initialProps:{id:"run",language:"nl"}});
 return {...hook,next,prepare,mark,actClient,progress,replaced};
}
test("accepted grading with unavailable next content retries only preparation",async()=>{
 const hook=setup();await waitFor(()=>expect(hook.result.current.candidate).not.toBeNull());
 hook.next.mockRejectedValueOnce(new Error("offline"));
 await act(async()=>{await hook.result.current.grade("success");});expect(hook.result.current.failed).toBe(true);expect(hook.progress).toHaveBeenCalledOnce();
 await act(async()=>{await hook.result.current.retry();});expect(hook.actClient).toHaveBeenCalledOnce();expect(hook.progress).toHaveBeenCalledOnce();expect(hook.result.current.candidate).not.toBeNull();
});
test("uncertain grading freezes payload and event ID until explicit Retry",async()=>{
 const hook=setup();hook.actClient.mockRejectedValueOnce(new Error("offline"));await waitFor(()=>expect(hook.result.current.candidate).not.toBeNull());
 await act(async()=>{await hook.result.current.grade("success");});expect(hook.result.current.actionRetryRequired).toBe(true);
 await act(async()=>{await hook.result.current.grade("fail");});expect(hook.actClient).toHaveBeenCalledOnce();expect(hook.progress).not.toHaveBeenCalled();
 await act(async()=>{await hook.result.current.retry();});expect(hook.actClient).toHaveBeenCalledTimes(2);expect(hook.actClient.mock.calls[1]).toEqual(hook.actClient.mock.calls[0]);expect(hook.progress).toHaveBeenCalledOnce();
});
test("late unavailable marks cannot continue a replaced run",async()=>{
 const hook=setup();await waitFor(()=>expect(hook.result.current.candidate).not.toBeNull());
 const marked=deferred<unknown>();hook.mark.mockReturnValueOnce(marked.promise);hook.next.mockResolvedValueOnce({status:"unavailable",targetId:"old",reason:"projection-missing"});
 let old!:Promise<void>;act(()=>{old=hook.result.current.loadNext();});await waitFor(()=>expect(hook.mark).toHaveBeenCalledOnce());
 hook.rerender({id:"replacement",language:"nl"});await waitFor(()=>expect(hook.next).toHaveBeenCalledTimes(3));
 await act(async()=>{marked.resolve({});await old;});expect(hook.next).toHaveBeenCalledTimes(3);expect(hook.result.current.candidate?.targetId).toBe("one");
});
test("a preparation preference refresh cannot discard an accepted grading receipt",async()=>{
 const hook=setup();await waitFor(()=>expect(hook.result.current.candidate).not.toBeNull());const receipt=deferred<unknown>();hook.actClient.mockReturnValueOnce(receipt.promise);
 let grade!:Promise<void>;act(()=>{grade=hook.result.current.grade("success");});hook.rerender({id:"run",language:"ru"});expect(hook.next).toHaveBeenCalledOnce();
 await act(async()=>{receipt.resolve({});await grade;});expect(hook.progress).toHaveBeenCalledOnce();expect(hook.result.current.completed).toBe(1);expect(hook.next).toHaveBeenCalledTimes(2);
});
test("a predecessor grade completing after unmount cannot advance progress or load",async()=>{
 const hook=setup();await waitFor(()=>expect(hook.result.current.candidate).not.toBeNull());const receipt=deferred<unknown>();hook.actClient.mockReturnValueOnce(receipt.promise);
 let grade!:Promise<void>;act(()=>{grade=hook.result.current.grade("success");});hook.unmount();await act(async()=>{receipt.resolve({});await grade;});expect(hook.progress).not.toHaveBeenCalled();expect(hook.next).toHaveBeenCalledOnce();
});
test("superseded next retires the run once, including subsequent retries",async()=>{
 const hook=setup();await waitFor(()=>expect(hook.result.current.candidate).not.toBeNull());hook.next.mockResolvedValue({status:"superseded"});
 await act(async()=>{await hook.result.current.loadNext();await hook.result.current.retry();});expect(hook.replaced).toHaveBeenCalledOnce();expect(hook.result.current.superseded).toBe(true);expect(hook.result.current.candidate).toBeNull();
});
test("superseded action retires without accepting a rejected grade",async()=>{
 const hook=setup();hook.actClient.mockRejectedValue(new Error("training_session_superseded"));await waitFor(()=>expect(hook.result.current.candidate).not.toBeNull());
 await act(async()=>{await hook.result.current.grade("success");});expect(hook.replaced).toHaveBeenCalledOnce();expect(hook.progress).not.toHaveBeenCalled();expect(hook.next).toHaveBeenCalledOnce();
});
test("authoritative terminal count wins over the local presentation count",async()=>{
 const hook=setup();await waitFor(()=>expect(hook.result.current.candidate).not.toBeNull());hook.next.mockResolvedValue({status:"exhausted",completedActions:3});
 await act(async()=>{await hook.result.current.loadNext();});expect(hook.result.current.completed).toBe(3);expect(hook.result.current.terminal).toBe("complete");expect(hook.actClient).not.toHaveBeenCalled();
});
test("pending translation retains one trailing hint without aborting the active read",async()=>{
 const hook=setup();await waitFor(()=>expect(hook.result.current.candidate).not.toBeNull());
 const pending=deferred<ExercisePreparation<Content>>();hook.prepare.mockReturnValueOnce(pending.promise);let read!:Promise<void>;
 act(()=>{read=hook.result.current.loadNext(false,true);});await waitFor(()=>expect(hook.prepare).toHaveBeenCalledTimes(2));
 await act(async()=>{await hook.result.current.loadNext(false,true);await hook.result.current.loadNext(false,true);});expect(hook.next).toHaveBeenCalledTimes(2);
 await act(async()=>{pending.resolve({state:"translation-pending"});await read;});await waitFor(()=>expect(hook.next).toHaveBeenCalledTimes(3));expect(hook.actClient).not.toHaveBeenCalled();expect(hook.mark).not.toHaveBeenCalled();
});
