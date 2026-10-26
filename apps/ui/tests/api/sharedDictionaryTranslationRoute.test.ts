import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { authenticate, rpc, translate } = vi.hoisted(() => ({
  authenticate: vi.fn(), rpc: vi.fn(), translate: vi.fn(),
}));
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: authenticate,
  getAuthenticatedUserSupabase: authenticate,
  requirePlatformScope: () => null,
  jsonNoStore: (body: unknown, status = 200) => Response.json(body, {status, headers:{"cache-control":"no-store"}}),
  withPlatformCors: (_request: unknown, response: Response) => response,
  platformCorsPreflight: () => new Response(null,{status:204}),
}));
vi.mock("@/lib/translation/dictionaryMeaningTranslationRequestService", () => ({requestDictionaryMeaningTranslation:translate}));
vi.mock("@/lib/translation/translationProvider", () => ({createTranslator:vi.fn(),loadTranslationConfigFromEnv:vi.fn()}));
import { POST } from "@/app/api/platform/translation/route";
import { GET } from "@/app/api/translation/route";
const entryId="75600000-0000-4000-8000-000000000001";
const original={id:entryId,dictionary_id:"author-dictionary",language_code:"nl",content_version:7,headword:"huis",raw:{meanings:[{definition:"woning"}]}};
const result={payload:{status:"ready",overlay:{secret:"translated author material"}},httpStatus:200,cacheStatus:"hit"};
const routes={
  platform:()=>POST(new NextRequest("http://localhost/api/platform/translation",{method:"POST",body:JSON.stringify({entryId,targetLang:"en"})})),
  legacy:()=>GET(new NextRequest(`http://localhost/api/translation?word_id=${entryId}&lang=en`)),
};
beforeEach(()=>{
  vi.resetAllMocks();
  authenticate.mockResolvedValue({user:{id:"recipient"},principal:{authKind:"first_party"},supabase:{rpc}});
  rpc.mockResolvedValue({data:original,error:null});
  translate.mockResolvedValue(result);
});
for(const [name,request] of Object.entries(routes))describe(`${name} shared dictionary translation delivery`,()=>{
  test.each(["revoked","error","throw","revision","content","dictionary","language","identity"])("does not emit material after %s while provider waits",async kind=>{
    let release!:(value:typeof result)=>void;
    translate.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
    const pending=request();
    await vi.waitFor(()=>expect(translate).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledTimes(1);
    if(kind==="throw")rpc.mockRejectedValue(new Error("database unavailable"));
    else rpc.mockResolvedValue({
      error:kind==="error"?{message:"private detail"}:null,
      data:kind==="revoked"?null:{...original,
        ...(kind==="revision"?{content_version:8}:{}),
        ...(kind==="content"?{raw:{meanings:[{definition:"edited"}]}}:{}),
        ...(kind==="dictionary"?{dictionary_id:"different-author"}:{}),
        ...(kind==="language"?{language_code:"de"}:{}),
        ...(kind==="identity"?{id:"different-entry"}:{}),
      },
    });
    release(result);
    const response=await pending;
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({error:"word_entry_not_found"});
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-platform-cache")).toBeNull();
    expect(response.headers.get("x-translation-cache")).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
    for(const call of rpc.mock.calls)expect(call).toEqual(["fetch_dictionary_entry_by_id_gated",{p_entry_id:entryId}]);
  });
  test.each(["hit","provider","pending"])("returns %s only after live same-source recheck",async cacheStatus=>{
    translate.mockResolvedValue({...result,cacheStatus});
    const response=await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject(result.payload);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  test("denies an already revoked entry before invoking translation",async()=>{
    rpc.mockResolvedValue({data:null,error:null});
    const response=await request();
    expect(response.status).toBe(404);
    expect(translate).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnce();
  });
});
