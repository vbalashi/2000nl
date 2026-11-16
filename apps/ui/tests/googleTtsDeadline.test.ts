import { afterEach, beforeEach, expect, test, vi } from "vitest";
const sdk=vi.hoisted(()=>({initialize:vi.fn(),synthesize:vi.fn(),close:vi.fn()}));
vi.mock("@google-cloud/text-to-speech",()=>({TextToSpeechClient:class {
 initialize=sdk.initialize;close=sdk.close;innerApiCalls={synthesizeSpeech:sdk.synthesize};
}}));
import { GoogleCloudTtsProvider } from "@/lib/audio/providers/googleCloudTtsProvider";
import { withProviderDeadline, ProviderOperationTimeout } from "@/lib/providers/providerTransport";
beforeEach(()=>{
 vi.useFakeTimers();vi.clearAllMocks();vi.stubEnv("GOOGLE_TTS_API_KEY","");vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS","/synthetic-sdk-credentials.json");
 sdk.initialize.mockResolvedValue({});sdk.close.mockResolvedValue(undefined);
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
test("voice fallback inherits only the last second and cancels the actual SDK RPC on operation timeout",async()=>{
 const firstCancel=vi.fn(),secondCancel=vi.fn();
 sdk.synthesize.mockImplementationOnce(()=>{
   const promise=new Promise((_,reject)=>setTimeout(()=>reject(new Error("voice unavailable")),239000));return Object.assign(promise,{cancel:firstCancel});
 }).mockImplementationOnce(()=>{
   let reject!:(reason:unknown)=>void;const promise=new Promise((_,r)=>{reject=r});secondCancel.mockImplementation(()=>reject(new Error("cancelled")));return Object.assign(promise,{cancel:secondCancel});
 });
 const pending=withProviderDeadline(()=>new GoogleCloudTtsProvider().generateAudio("synthetic phrase"));
 const rejected=expect(pending).rejects.toBeInstanceOf(ProviderOperationTimeout);
 await vi.advanceTimersByTimeAsync(239000);
 expect(sdk.synthesize).toHaveBeenCalledTimes(2);expect(sdk.synthesize.mock.calls[0][1]).toMatchObject({timeout:240000,retry:null});
 expect(sdk.synthesize.mock.calls[1][1]).toMatchObject({timeout:1000,retry:null});expect(secondCancel).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1000);await rejected;
 expect(secondCancel).toHaveBeenCalledOnce();expect(firstCancel).not.toHaveBeenCalled();expect(sdk.close).toHaveBeenCalledTimes(2);
});
test("a late SDK initialization cannot start a paid RPC after the operation deadline",async()=>{
 let initialized!:(value:unknown)=>void;sdk.initialize.mockImplementation(()=>new Promise(resolve=>{initialized=resolve}));
 const pending=withProviderDeadline(()=>new GoogleCloudTtsProvider().generateAudio("synthetic phrase"),10);
 const rejected=expect(pending).rejects.toBeInstanceOf(ProviderOperationTimeout);
 await vi.advanceTimersByTimeAsync(10);await rejected;initialized({});await vi.advanceTimersByTimeAsync(1);
 expect(sdk.synthesize).not.toHaveBeenCalled();expect(sdk.close).toHaveBeenCalledOnce();
});
