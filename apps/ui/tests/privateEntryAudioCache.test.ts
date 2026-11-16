import { NextRequest } from "next/server";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { providerWorkFixture } from "./providerWorkFixtures";
const { generate, service } = vi.hoisted(() => ({ generate: vi.fn(), service: vi.fn() }));
vi.mock("@/lib/audio/audioProviderFactory", () => ({ createAudioProvider: () => ({ id: "free", generateAudio: generate }) }));
vi.mock("@/lib/platform/serverSupabase", () => ({ getPlatformServiceSupabase: service }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.resetModules(); });
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), "entry-audio-"));
  vi.resetModules(); vi.stubEnv("TTS_CACHE_DIR", folder); vi.stubEnv("AUDIO_QUALITY_DEFAULT", "free");
  const work = providerWorkFixture(); service.mockReturnValue({ supabase: { rpc: work.rpc } });
  generate.mockReset(); generate.mockResolvedValue({ audioMp3: Buffer.from([4,5,6]) });
  return { folder, work, cache: await import("@/lib/audio/ttsCache") };
}
test("private audio remains64hex, public GET cannot serve it, cache hits do not reacquire generation", async () => {
  const { folder, work, cache } = await fixture();
  try {
    const first = await cache.resolvePrivateEntryTtsAudio("huis", "owner");
    expect(first).toEqual({ audio: Buffer.from([4,5,6]), cached:false });
    expect(await cache.resolvePrivateEntryTtsAudio("huis", "viewer")).toEqual({ ...first, cached:true });
    expect(work.rpc.mock.calls.filter(([name]) => name === "begin_provider_work_v1")).toHaveLength(1);
    const files = (await readdir(folder, { recursive:true })).filter(name => name.endsWith(".mp3"));
    expect(files).toHaveLength(1); expect(files[0]).toMatch(/[0-9a-f]{64}\.mp3$/);
    const key = files[0].split(/[\\/]/).at(-1)!.replace(".mp3", "");
    const { GET } = await import("@/app/api/tts/route");
    expect((await GET(new NextRequest(`http://localhost/api/tts?key=${key}`))).status).toBe(400);
    expect((await cache.resolveTtsAudio({ text:"huis", accountId:"owner" })).cacheKey).toMatch(/^[0-9a-f]{16}$/);
    expect(generate).toHaveBeenCalledTimes(2);
  } finally { await rm(folder, { recursive:true, force:true }); }
});
test.each([false,true])("concurrent misses coalesce through shared coordinator (private:%s)", async privateAudio => {
  const { folder, cache, work } = await fixture();
  try {
    generate.mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 30)); return { audioMp3:Buffer.from([7,8]) }; });
    const results = await Promise.all(Array.from({ length:10 }, () => privateAudio ? cache.resolvePrivateEntryTtsAudio("huis", "owner") : cache.resolveTtsAudio({ text:"huis", accountId:"owner" })));
    expect(results).toHaveLength(10); expect(generate).toHaveBeenCalledOnce();
    expect(work.rpc.mock.calls.filter(([name]) => name === "finish_provider_work_v1")).toHaveLength(1);
    // Lose local disk like a fresh replica: bytes still come from the shared result.
    await rm(folder, { recursive:true, force:true });
    expect((privateAudio ? await cache.resolvePrivateEntryTtsAudio("huis", "owner") : await cache.resolveTtsAudio({text:"huis",accountId:"owner"})).cached).toBe(true);
    expect(generate).toHaveBeenCalledOnce();
  } finally { await rm(folder, { recursive:true, force:true }); }
});
test("twenty prepared cards followed by playback reserve twenty generations, not forty",async()=>{
 const {folder,cache,work}=await fixture();
 try{
   for(let i=0;i<20;i++){
     expect((await cache.resolvePrivateEntryTtsAudio(`synthetic word ${i}`,"owner")).cached).toBe(false);
     expect((await cache.resolvePrivateEntryTtsAudio(`synthetic word ${i}`,"owner")).cached).toBe(true);
   }
   expect(generate).toHaveBeenCalledTimes(20);expect(work.rpc.mock.calls.filter(([name])=>name==="begin_provider_work_v1")).toHaveLength(20);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test("a rejected publication fence cannot expose a local TTS file",async()=>{
 const {folder,cache,work}=await fixture();
 try{
   const boundary=work.rpc.getMockImplementation()!;
   work.rpc.mockImplementation((name,args)=>name==="finish_provider_work_v1"?{abortSignal:()=>Promise.resolve({data:false,error:null})}:boundary(name,args));
   await expect(cache.resolveTtsAudio({text:"synthetic fenced phrase",accountId:"owner"})).rejects.toMatchObject({code:"provider_work_lease_lost"});
   expect((await readdir(folder,{recursive:true})).filter(name=>name.endsWith(".mp3"))).toHaveLength(0);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test("an unresolved shared audio claim returns retryable503 after a bounded wait",async()=>{
 const {folder,cache,work}=await fixture();
 try{
   work.rpc.mockImplementation(name=>({abortSignal:()=>Promise.resolve({data:name==="begin_provider_work_v1"?{status:"pending",retryAfterMs:1000}:null,error:null})}));
   const pending=cache.resolveTtsAudio({text:"synthetic pending phrase",accountId:"owner"});
   const rejected=expect(pending).rejects.toMatchObject({code:"audio_pending",httpStatus:503,retryAfterMs:1000});
   await rejected;expect(generate).not.toHaveBeenCalled();
 }finally{await rm(folder,{recursive:true,force:true});}
});
