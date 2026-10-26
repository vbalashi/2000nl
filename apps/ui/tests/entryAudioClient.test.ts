import {afterEach,beforeEach,expect,test,vi} from "vitest";
const {headers}=vi.hoisted(()=>({headers:vi.fn()}));
vi.mock("@/lib/platform/platformV2Http",()=>({platformV2AuthenticatedJsonHeaders:headers}));
import {clearPlatformV2TrainingMediaCache,preloadPlatformV2Audio,resolvePlatformV2Audio} from "@/lib/platform/platformV2TrainingMediaClient";
const input={cacheOwnerId:"viewer",entryId:"entry-1",capability:{audioId:"header-1",actionId:"play-audio" as const,contentLanguageCode:"nl"},text:"untrusted text"};
const currentCard={sessionId:"session",permitId:"permit"};
const response=()=>new Response(new Uint8Array([1,2]),{headers:{"content-type":"audio/mpeg"}});
beforeEach(()=>{headers.mockReset();headers.mockResolvedValue({authorization:"Bearer viewer"});vi.stubGlobal("URL",class extends URL{static createObjectURL=vi.fn(()=>"blob:audio");static revokeObjectURL=vi.fn();});});
afterEach(()=>{clearPlatformV2TrainingMediaCache();vi.unstubAllGlobals();});
test("preparation does not authorize playback or retain bytes; play always makes another authorized request",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(Response.json({status:"ready"})).mockResolvedValueOnce(response());vi.stubGlobal("fetch",fetch);
  expect(await preloadPlatformV2Audio(input)).toBe("");
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(await resolvePlatformV2Audio({...input,currentCard})).toBe("blob:audio");
  expect(fetch).toHaveBeenCalledTimes(2);
  const bodies=fetch.mock.calls.map(([,init])=>JSON.parse(init.body));
  expect(bodies).toEqual([{entryId:"entry-1",prepareOnly:true},{entryId:"entry-1",currentCard,prepareOnly:false}]);
  expect(bodies.some(body=>"text"in body)).toBe(false);
  expect(headers).toHaveBeenCalledWith("viewer");
  clearPlatformV2TrainingMediaCache("viewer");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audio");
});
test("a revoked play is denied even after preparation succeeded",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(Response.json({status:"ready"})).mockResolvedValueOnce(Response.json({error:"entry_audio_not_available"},{status:404}));vi.stubGlobal("fetch",fetch);
  await preloadPlatformV2Audio(input);
  await expect(resolvePlatformV2Audio(input)).rejects.toThrow("entry_audio_not_available");
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
test.each(["account-change","clear","abort"])("%s during fetch cannot return an audio URL",async kind=>{
  let release!:(value:Response)=>void;
  const fetch=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));vi.stubGlobal("fetch",fetch);
  const controller=new AbortController();
  const pending=resolvePlatformV2Audio({...input,signal:controller.signal});
  await vi.waitFor(()=>expect(fetch).toHaveBeenCalledOnce());
  if(kind==="account-change")headers.mockRejectedValue(new Error("auth_account_changed"));
  if(kind==="clear")clearPlatformV2TrainingMediaCache("viewer");
  if(kind==="abort")controller.abort();
  release(response());
  await expect(pending).rejects.toThrow();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test("the preparation pipeline and card effect deduplicate the same account/source, while play reauthorizes",async()=>{
  let release!:(value:Response)=>void;
  const fetch=vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{release=resolve;})).mockResolvedValueOnce(response());
  vi.stubGlobal("fetch",fetch);
  const pipeline=preloadPlatformV2Audio(input);
  const cardEffect=preloadPlatformV2Audio({...input});
  await vi.waitFor(()=>expect(fetch).toHaveBeenCalledOnce());
  release(Response.json({status:"ready"}));
  await Promise.all([pipeline,cardEffect]);
  expect(await resolvePlatformV2Audio({...input,currentCard})).toBe("blob:audio");
  expect(fetch).toHaveBeenCalledTimes(2);
});


test("node playback submits only its entry/node binding and exact permit, never source text",async()=>{
  const fetch=vi.fn().mockResolvedValue(response());vi.stubGlobal("fetch",fetch);
  const node={contentNodeId:"example-id",sourceTextFingerprint:"fingerprint"};
  await resolvePlatformV2Audio({...input,node,currentCard});
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({entryId:input.entryId,node,currentCard,prepareOnly:false});
});
