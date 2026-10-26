import {NextRequest} from "next/server";
import {mkdtemp,readdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,expect,test,vi} from "vitest";
const {generate}=vi.hoisted(()=>({generate:vi.fn()}));
vi.mock("@/lib/audio/audioProviderFactory",()=>({createAudioProvider:()=>({id:"free",generateAudio:generate})}));
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});
test("private entry audio uses a separate64hex cache and reuses bytes without exposing a URL",async()=>{
  const folder=await mkdtemp(join(tmpdir(),"entry-audio-"));
  try{
    vi.resetModules();vi.stubEnv("TTS_CACHE_DIR",folder);vi.stubEnv("AUDIO_QUALITY_DEFAULT","free");
    generate.mockResolvedValue({audioMp3:Buffer.from([4,5,6])});
    const {resolvePrivateEntryTtsAudio,resolveTtsAudio}=await import("@/lib/audio/ttsCache");
    const first=await resolvePrivateEntryTtsAudio("huis");
    expect(first).toEqual({audio:Buffer.from([4,5,6]),cached:false});
    expect(await resolvePrivateEntryTtsAudio("huis")).toEqual({...first,cached:true});
    expect(generate).toHaveBeenCalledOnce();
    const files=await readdir(folder,{recursive:true});
    expect(files.filter(name=>name.endsWith(".mp3"))).toHaveLength(1);
    expect(files.find(name=>name.endsWith(".mp3"))).toMatch(/[0-9a-f]{64}\.mp3$/);
    const privateFile=files.find(name=>name.endsWith(".mp3"))!;
    const privateKey=privateFile.split(/[\\/]/).at(-1)!.replace(".mp3","");
    const {GET}=await import("@/app/api/tts/route");
    const publicRead=await GET(new NextRequest(`http://localhost/api/tts?key=${privateKey}`));
    expect(publicRead.status).toBe(400);
    expect(publicRead.headers.get("content-type")).toContain("application/json");
    const ordinary=await resolveTtsAudio({text:"huis"});
    expect(ordinary.cacheKey).toMatch(/^[0-9a-f]{16}$/);
    expect(ordinary.url).toMatch(/^\/api\/tts\?key=[0-9a-f]{16}$/);
    expect(generate).toHaveBeenCalledTimes(2);
  }finally{await rm(folder,{recursive:true,force:true});}
});

test("twenty prepared cards can each play freshly authorized cached audio without forty generation charges",async()=>{
  const folder=await mkdtemp(join(tmpdir(),"entry-audio-budget-"));
  try{
    vi.resetModules();vi.stubEnv("TTS_CACHE_DIR",folder);vi.stubEnv("AUDIO_QUALITY_DEFAULT","free");
    generate.mockReset();generate.mockResolvedValue({audioMp3:Buffer.from([4,5,6])});
    const {resolvePrivateEntryTtsAudio}=await import("@/lib/audio/ttsCache");
    const {consumeAudioRateLimit}=await import("@/lib/audio/audioRateLimit");
    const owner=`budget-${folder}`;
    const charge=vi.fn(()=>{if(!consumeAudioRateLimit(owner).allowed)throw new Error("audio_rate_limited");});
    for(let n=0;n<20;n++){
      expect(consumeAudioRateLimit(`entry-read:${owner}`,120).allowed).toBe(true);
      expect((await resolvePrivateEntryTtsAudio(`word ${n}`,charge)).cached).toBe(false);
      expect(consumeAudioRateLimit(`entry-read:${owner}`,120).allowed).toBe(true);
      expect((await resolvePrivateEntryTtsAudio(`word ${n}`,charge)).cached).toBe(true);
    }
    expect(charge).toHaveBeenCalledTimes(20);expect(generate).toHaveBeenCalledTimes(20);
    await expect(resolvePrivateEntryTtsAudio("word21",charge)).rejects.toThrow("audio_rate_limited");
    expect(generate).toHaveBeenCalledTimes(20);
  }finally{await rm(folder,{recursive:true,force:true});}
});

test("concurrent preparation and play share one private generation and one charge",async()=>{
  const folder=await mkdtemp(join(tmpdir(),"entry-audio-concurrent-"));
  try{
    vi.resetModules();vi.stubEnv("TTS_CACHE_DIR",folder);vi.stubEnv("AUDIO_QUALITY_DEFAULT","free");
    let release!:(value:{audioMp3:Buffer})=>void;
    generate.mockReset();generate.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
    const {resolvePrivateEntryTtsAudio}=await import("@/lib/audio/ttsCache");
    const charge=vi.fn();
    const pending=Array.from({length:3},()=>resolvePrivateEntryTtsAudio("huis",charge));
    await vi.waitFor(()=>expect(generate).toHaveBeenCalledOnce());
    release({audioMp3:Buffer.from([7,8])});
    for(const result of await Promise.all(pending))expect(result.audio).toEqual(Buffer.from([7,8]));
    expect(charge).toHaveBeenCalledOnce();
  }finally{await rm(folder,{recursive:true,force:true});}
});
