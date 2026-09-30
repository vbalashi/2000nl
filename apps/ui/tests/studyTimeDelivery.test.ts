import { expect,test,vi } from "vitest";
vi.mock("@/lib/supabaseClient",() => ({supabase:{auth:{getSession:vi.fn()}}}));
import { StudyTimeDelivery } from "@/lib/training/studyTime/delivery";
import type { StudyTimeMeasurement } from "@/lib/training/studyTime/model";
const measurement: StudyTimeMeasurement = {measurementId:"id-a",sessionId:"session-a",family:"meaning",entryId:"entry-a",cardTypeId:"word-to-definition",targetId:null,activeMilliseconds:15000,observedAt:"2026-09-30T10:00:00Z"};
test("retries the immutable measurement, serializes later durations, and never retries a 4xx rejection",async () => {
  const callbacks: (()=>void)[] = [];
  const send = vi.fn().mockResolvedValueOnce("retry").mockResolvedValueOnce("accepted").mockResolvedValueOnce("rejected");
  const queue = new StudyTimeDelivery("a",{principal:async()=>"a",send,schedule:fn=>{callbacks.push(fn);}});
  queue.enqueue(measurement); queue.enqueue({...measurement,measurementId:"id-b"});
  await vi.waitFor(()=>expect(callbacks).toHaveLength(1)); expect(send).toHaveBeenCalledTimes(1);
  callbacks[0](); await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(3));
  expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
  expect(send.mock.calls[2][0].measurementId).toBe("id-b"); expect(callbacks).toHaveLength(1);
});
test("does not send measurements under a changed principal, including a pending retry",async () => {
  let principal="a"; const callbacks: (()=>void)[]=[]; const send=vi.fn().mockResolvedValue("retry");
  const queue=new StudyTimeDelivery("a",{principal:async()=>principal,send,schedule:fn=>{callbacks.push(fn);}});
  queue.enqueue(measurement); await vi.waitFor(()=>expect(callbacks).toHaveLength(1));
  principal="b"; callbacks[0](); queue.enqueue({...measurement,measurementId:"id-b"});
  await new Promise(resolve=>setTimeout(resolve,20)); expect(send).toHaveBeenCalledTimes(1);
});
test("bounds failures to three attempts and continues later independent measurements",async () => {
  const callbacks: (()=>void)[]=[]; const send=vi.fn().mockResolvedValue("retry");
  const queue=new StudyTimeDelivery("a",{principal:async()=>"a",send,schedule:fn=>{callbacks.push(fn);}});
  queue.enqueue(measurement);
  await vi.waitFor(()=>expect(callbacks).toHaveLength(1)); callbacks[0]();
  await vi.waitFor(()=>expect(callbacks).toHaveLength(2)); callbacks[1]();
  await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(3));
  send.mockResolvedValue("accepted"); queue.enqueue({...measurement,measurementId:"next"});
  await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(4)); expect(callbacks).toHaveLength(2);
});
test("bounds memory to 64 receipts and copies payloads before asynchronous delivery",async () => {
  let release!: (v: "accepted")=>void;
  const held = new Promise<"accepted">(resolve=>{release=resolve;});
  const send=vi.fn().mockReturnValueOnce(held).mockResolvedValue("accepted");
  const queue=new StudyTimeDelivery("a",{principal:async()=>"a",send,schedule:()=>{}});
  const mutable={...measurement}; queue.enqueue(mutable); mutable.activeMilliseconds=999;
  for(let i=1;i<100;i++) queue.enqueue({...measurement,measurementId:`id-${i}`});
  await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(1)); expect(send.mock.calls[0][0].activeMilliseconds).toBe(15000);
  release("accepted"); await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(64));
});
