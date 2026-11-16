import { beforeEach, afterEach, expect, test, vi } from "vitest";
const { service, rpc }=vi.hoisted(()=>({service:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/platform/serverSupabase",()=>({getPlatformServiceSupabase:service}));
import { runProviderWork, ProviderWorkError, providerWorkIdentity } from "@/lib/providers/providerSafety";
import { withProviderDeadline, providerFetch, ProviderOperationTimeout } from "@/lib/providers/providerTransport";
const input={kind:"text" as const,identity:providerWorkIdentity("synthetic"),accountId:"owner",inputCharacters:10,execute:vi.fn(async()=>({text:"translated"})),failureCode:()=>"provider_timeout"};
function respond(data:unknown,error:unknown=null){return {abortSignal:()=>Promise.resolve({data,error})};}
beforeEach(()=>{vi.clearAllMocks();service.mockReturnValue({supabase:{rpc}});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
test("unconfirmed admission and cached failure never call a paid provider",async()=>{
 rpc.mockReturnValue(respond(null,{message:"private db failure"}));
 await expect(runProviderWork(input)).rejects.toMatchObject({code:"provider_work_unavailable",httpStatus:503});expect(input.execute).not.toHaveBeenCalled();
 rpc.mockReturnValue(respond({status:"failed",error:"provider_timeout",retryAfterMs:20000}));
 await expect(runProviderWork(input)).rejects.toMatchObject({code:"provider_timeout",httpStatus:502,retryAfterMs:20000});expect(input.execute).not.toHaveBeenCalled();
});
test("stale completion is503, never ready; unconfirmed completion is not overwritten as failure",async()=>{
 rpc.mockReturnValueOnce(respond({status:"claimed",leaseToken:"token"})).mockReturnValueOnce(respond(false));
 await expect(runProviderWork(input)).rejects.toMatchObject({code:"provider_work_lease_lost",httpStatus:503});expect(rpc.mock.calls).toHaveLength(2);
 expect(rpc.mock.calls[1][1]).toMatchObject({p_lease_token:"token",p_result:{text:"translated"}});
 rpc.mockClear();rpc.mockReturnValueOnce(respond({status:"claimed",leaseToken:"token"})).mockReturnValueOnce(respond(null,{message:"lost response"}));
 await expect(runProviderWork(input)).rejects.toBeInstanceOf(ProviderWorkError);expect(rpc.mock.calls).toHaveLength(2);
});
test("deadline aborts the actual primary/fallback fetch scope, and a late result cannot complete work",async()=>{
 vi.useFakeTimers();let fetchSignal:AbortSignal|undefined;let resolve!:(r:Response)=>void;
 vi.stubGlobal("fetch",vi.fn((_url,init)=>{fetchSignal=init.signal;return new Promise<Response>(r=>{resolve=r})}));
 let output=false;const pending=withProviderDeadline(async()=>{await providerFetch("https://provider.invalid");output=true;return "late"},10);
 const rejection=expect(pending).rejects.toBeInstanceOf(ProviderOperationTimeout);
 await vi.advanceTimersByTimeAsync(10);await rejection;expect(fetchSignal?.aborted).toBe(true);expect(output).toBe(false);
 resolve(new Response());await Promise.resolve();
});
test("operation timeout records only a failure; a late provider resolution cannot issue completion",async()=>{
 vi.useFakeTimers();let release!:(v:Record<string,string>)=>void;
 rpc.mockReturnValueOnce(respond({status:"claimed",leaseToken:"token"})).mockReturnValueOnce(respond(true));
 const late={...input,execute:()=>new Promise<Record<string,string>>(resolve=>{release=resolve})};
 const pending=runProviderWork(late);const rejected=expect(pending).rejects.toMatchObject({code:"provider_timeout",httpStatus:502});
 await vi.advanceTimersByTimeAsync(240000);await rejected;
 expect(rpc.mock.calls[1][1]).toMatchObject({p_error_code:"provider_timeout"});
 release({text:"late"});await vi.advanceTimersByTimeAsync(1);expect(rpc).toHaveBeenCalledTimes(2);
});
