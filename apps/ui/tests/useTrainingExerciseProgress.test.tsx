import {act,renderHook} from "@testing-library/react";
import {expect,test,vi} from "vitest";
import {useTrainingExerciseProgress} from "@/components/training/useTrainingExerciseProgress";
function setup(){
 const notify=vi.fn();
 const hook=renderHook(({completed,consumed,members})=>useTrainingExerciseProgress({sessionId:"run",completedActions:completed,
  ...(members?{members:[{targetId:"pending",consumedAt:consumed?"2026-10-31T18:00:00Z":null}]}:{})},notify),{initialProps:{completed:0,consumed:false,members:true}});
 return {...hook,notify};
}
test("snapshot including a pending grade and its later receipt count that member once",()=>{
 const hook=setup();const commit=hook.result.current.prepareAcceptance("pending");
 hook.rerender({completed:1,consumed:true,members:true});act(()=>{commit();});
 expect(hook.result.current.completed).toBe(1);expect(hook.notify).toHaveBeenLastCalledWith({sessionId:"run",completedActions:1,completionReason:null});
});
test("unrelated authoritative progress plus this member's later receipt count both",()=>{
 const hook=setup();const commit=hook.result.current.prepareAcceptance("pending");
 hook.rerender({completed:1,consumed:false,members:true});act(()=>{commit();});expect(hook.result.current.completed).toBe(2);
});
test("one prepared acceptance cannot publish twice after retry or replay",()=>{
 const hook=setup();const commit=hook.result.current.prepareAcceptance("pending");
 act(()=>{commit();commit();});expect(hook.result.current.completed).toBe(1);expect(hook.notify).toHaveBeenCalledOnce();
});
test("partial snapshot without member identity uses the pre-dispatch floor",()=>{
 const hook=setup();hook.rerender({completed:0,consumed:false,members:false});const commit=hook.result.current.prepareAcceptance("pending");
 hook.rerender({completed:1,consumed:false,members:false});act(()=>{commit();});expect(hook.result.current.completed).toBe(1);
});
test("terminal count stays authoritative after a reconciled acceptance",()=>{
 const hook=setup();const commit=hook.result.current.prepareAcceptance("pending");
 hook.rerender({completed:1,consumed:true,members:true});act(()=>{commit();hook.result.current.finish({status:"exhausted",completedActions:3});});
 expect(hook.result.current.completed).toBe(3);expect(hook.notify).toHaveBeenLastCalledWith({sessionId:"run",completedActions:3,completionReason:"exhausted"});
});
