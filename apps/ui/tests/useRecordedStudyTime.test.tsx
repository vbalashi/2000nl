import { afterEach,expect,test,vi } from "vitest";
import { renderHook } from "@testing-library/react";
const { measure,deliver } = vi.hoisted(()=>({measure:vi.fn(),deliver:vi.fn()}));
vi.mock("@/components/training/useActiveStudyTime",()=>({useActiveStudyTime:measure}));
vi.mock("@/lib/training/studyTime/delivery",()=>({deliverStudyTime:deliver}));
import { useRecordedStudyTime } from "@/components/training/useRecordedStudyTime";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
test("an unowned or unprepared card cannot start study-time measurement",()=>{
  const {rerender}=renderHook(({sessionId})=>useRecordedStudyTime({ownerId:"owner",sessionId,family:"meaning",entryId:"entry",cardTypeId:"word-to-definition",enabled:true}),{initialProps:{sessionId:"session" as string|null}});
  expect(measure.mock.lastCall?.[0]).toMatchObject({enabled:true,identity:{ownerId:"owner",sessionId:"session",family:"meaning"}});
  rerender({sessionId:null});
  expect(measure.mock.lastCall?.[0].identity).toBeNull();
});
test.each(["idiom","sentence"] as const)("content-bound %s identity uses its target, not an ordinary direction",family=>{
  renderHook(()=>useRecordedStudyTime({ownerId:"owner",sessionId:"session",family,entryId:"entry",targetId:"target",enabled:true}));
  expect(measure.mock.lastCall?.[0]).toMatchObject({enabled:true,identity:{ownerId:"owner",sessionId:"session",family,target:{entryId:"entry",targetId:"target",cardTypeId:null}},onDuration:deliver});
});
