import { afterEach,expect,test,vi } from "vitest";
import { renderHook } from "@testing-library/react";
const { measure,deliver } = vi.hoisted(()=>({measure:vi.fn(),deliver:vi.fn()}));
vi.mock("@/components/training/useActiveStudyTime",()=>({useActiveStudyTime:measure}));
vi.mock("@/lib/training/studyTime/delivery",()=>({deliverStudyTime:deliver}));
import { useRecordedStudyTime } from "@/components/training/useRecordedStudyTime";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
test("disabled rollout has no measurement identity; an unowned/unprepared card cannot start it",()=>{
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1","false");
  const {rerender}=renderHook(({sessionId})=>useRecordedStudyTime({ownerId:"owner",sessionId,family:"meaning",entryId:"entry",cardTypeId:"word-to-definition",enabled:true}),{initialProps:{sessionId:"session" as string|null}});
  expect(measure.mock.lastCall?.[0]).toMatchObject({identity:null,enabled:false});
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1","true"); rerender({sessionId:null});
  expect(measure.mock.lastCall?.[0].identity).toBeNull();
});
test.each(["idiom","sentence"] as const)("content-bound %s identity uses its target, not an ordinary direction",family=>{
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1","true");
  renderHook(()=>useRecordedStudyTime({ownerId:"owner",sessionId:"session",family,entryId:"entry",targetId:"target",enabled:true}));
  expect(measure.mock.lastCall?.[0]).toMatchObject({enabled:true,identity:{ownerId:"owner",sessionId:"session",family,target:{entryId:"entry",targetId:"target",cardTypeId:null}},onDuration:deliver});
});
