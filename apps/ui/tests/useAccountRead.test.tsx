import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/preferences/accountRequest", () => ({ authenticatedAccountRequest: request }));
import { useAccountRead } from "@/lib/training/activity/useAccountRead";
const parse = (body: unknown) => typeof body === "number" ? body : null;
const response = (value: number) => ({ ok: true, json: async () => value });
beforeEach(() => { request.mockReset(); });
test("retains ready content on reopen and failed background refresh", async () => {
 request.mockResolvedValueOnce(response(12));
 const view = renderHook(({open,refresh}) => useAccountRead("/stats?language=nl","a",parse,open,refresh),{initialProps:{open:true,refresh:0}});
 await waitFor(() => expect(view.result.current).toMatchObject({status:"ready",value:12}));
 view.rerender({open:false,refresh:0});
 let reject!: (reason: Error) => void;
 request.mockImplementationOnce(() => new Promise((_,fail) => {reject=fail;}));
 view.rerender({open:true,refresh:0});
 expect(view.result.current).toMatchObject({status:"ready",value:12});
 await act(async () => reject(new Error("offline")));
 expect(view.result.current).toMatchObject({status:"ready",value:12,refreshFailed:true});
 request.mockResolvedValueOnce(response(13));
 view.rerender({open:true,refresh:1});
 expect(view.result.current).toMatchObject({status:"ready",value:12});
 await waitFor(() => expect(view.result.current).toMatchObject({status:"ready",value:13,refreshFailed:false}));
});
test("separates language scopes and account data", async () => {
 request.mockResolvedValueOnce(response(1)).mockResolvedValueOnce(response(2));
 const view=renderHook(({path,owner})=>useAccountRead(path,owner,parse,true,0),{initialProps:{path:"/stats?language=nl",owner:"a"}});
 await waitFor(()=>expect(view.result.current).toMatchObject({value:1}));
 view.rerender({path:"/stats?language=en",owner:"a"});
 expect(view.result.current.status).toBe("loading");
 await waitFor(()=>expect(view.result.current).toMatchObject({value:2}));
 request.mockImplementation((_path, _owner, options) => new Promise((_, reject) => { options.signal.addEventListener("abort", () => reject(new Error("aborted")), {once:true}); }));
 view.rerender({path:"/stats?language=nl",owner:"a"});
 expect(view.result.current).toMatchObject({value:1});
 view.rerender({path:"/stats?language=nl",owner:"b"});
 expect(view.result.current.status).toBe("loading");
});

test("accepted actions refresh ready data without a loading flash; late account response is ignored", async () => {
 const { publishPlatformV2CardStateChanged } = await import("@/lib/platform/platformV2CardStateChanges");
 request.mockResolvedValueOnce(response(5));
 const view=renderHook(({owner})=>useAccountRead("/stats",owner,parse,true,0),{initialProps:{owner:"a"}});
 await waitFor(()=>expect(view.result.current).toMatchObject({value:5}));
 let resolveOld!: (value: ReturnType<typeof response>) => void;
 request.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}));
 act(()=>publishPlatformV2CardStateChanged("entry"));
 expect(view.result.current).toMatchObject({status:"ready",value:5});
 request.mockResolvedValueOnce(response(99));
 view.rerender({owner:"b"});
 await waitFor(()=>expect(view.result.current).toMatchObject({value:99}));
 await act(async()=>resolveOld(response(6)));
 expect(view.result.current).toMatchObject({value:99});
});

test("bounds a stalled refresh and keeps its previous value", async () => {
 request.mockResolvedValueOnce(response(7));
 const view=renderHook(({refresh})=>useAccountRead("/stats","a",parse,true,refresh),{initialProps:{refresh:0}});
 await waitFor(()=>expect(view.result.current).toMatchObject({value:7}));
 vi.useFakeTimers();
 try {
   let signal!: AbortSignal;
   request.mockImplementationOnce((_path,_owner,options)=>new Promise((_,reject)=>{
     signal=options.signal;
     signal.addEventListener("abort",()=>reject(new Error("aborted")),{once:true});
   }));
   view.rerender({refresh:1});
   await act(async()=>{ await vi.advanceTimersByTimeAsync(10000); });
   expect(signal.aborted).toBe(true);
   expect(view.result.current).toMatchObject({status:"ready",value:7,refreshFailed:true});
 } finally { vi.useRealTimers(); }
});
