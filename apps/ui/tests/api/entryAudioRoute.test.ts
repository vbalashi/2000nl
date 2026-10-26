import {NextRequest} from "next/server";
import {afterEach,beforeEach,expect,test,vi} from "vitest";
const {auth,rpc,resolve,scope,rate}=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),resolve:vi.fn(),scope:vi.fn(),rate:vi.fn()}));
vi.mock("@/lib/platform/serverSupabase",()=>({getAuthenticatedSupabase:auth,requirePlatformScope:scope,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status,headers:{"cache-control":"no-store"}})}));
vi.mock("@/lib/audio/ttsCache",()=>({resolvePrivateEntryTtsAudio:resolve}));
vi.mock("@/lib/audio/audioRateLimit",()=>({consumeAudioRateLimit:rate}));
import {POST} from "@/app/api/platform/v2/audio/route";
const id="75600000-0000-4000-8000-000000000001";
const entry={id,headword:"huis",raw:{meanings:[{definition:"woning"}]},dictionary_id:"author",language_code:"nl",content_version:7};
const currentCard={sessionId:"75600000-0000-4000-8000-000000000002",permitId:"75600000-0000-4000-8000-000000000003"};
const bytes=Buffer.from([1,2,3]);
const request=(body:unknown={entryId:id})=>new NextRequest("http://localhost/api/platform/v2/audio",{method:"POST",body:JSON.stringify(body)});
beforeEach(()=>{
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED","true");
  auth.mockResolvedValue({user:{id:"viewer"},principal:{authKind:"first_party"},supabase:{rpc}});
  rpc.mockResolvedValue({data:entry,error:null});
  scope.mockReturnValue(null);rate.mockReturnValue({allowed:true});
  resolve.mockResolvedValue({audio:bytes,cached:false});
});
afterEach(()=>{vi.unstubAllEnvs();});
test.each([false,true])("streams private audio after two live entry checks (cache hit:%s)",async cached=>{
  resolve.mockResolvedValue({audio:bytes,cached});
  const response=await POST(request());
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-type")).toBe("audio/mpeg");
  expect(response.headers.get("location")).toBeNull();
  expect(resolve).toHaveBeenCalledWith("huis",expect.any(Function));
  expect(rpc.mock.calls).toEqual(Array(2).fill(["fetch_dictionary_entry_by_id_gated",{p_entry_id:id}]));
});
test("preparation returns no bytes, key or reusable public URL",async()=>{
  const response=await POST(request({entryId:id,prepareOnly:true}));
  expect(await response.json()).toEqual({status:"ready"});
  expect(rpc).toHaveBeenCalledTimes(2);
});
test.each(["revoked","read-error","source-changed"])("denies audio if %s while generation waits",async kind=>{
  let release!:(v:unknown)=>void;
  resolve.mockImplementation(()=>new Promise(r=>{release=r;}));
  const pending=POST(request());
  await vi.waitFor(()=>expect(resolve).toHaveBeenCalledOnce());
  rpc.mockResolvedValue(kind==="revoked"?{data:null,error:null}:kind==="read-error"?{data:null,error:{message:"secret"}}:{data:{...entry,content_version:8},error:null});
  release({audio:bytes,cached:false});
  const response=await pending;
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({error:"entry_audio_not_available"});
});
test("an exact current permit can read a revoked entry without using live browse access",async()=>{
  rpc.mockResolvedValue({data:{items:[entry]},error:null});
  const response=await POST(request({entryId:id,currentCard}));
  expect(response.status).toBe(200);
  for(const call of rpc.mock.calls)expect(call).toEqual(["read_current_training_entry_v1",{p_user_id:"viewer",p_session_id:currentCard.sessionId,p_permit_id:currentCard.permitId}]);
});
test.each(["expired","changed","different-entry"])("current target %s during generation denies delivery",async kind=>{
  rpc.mockResolvedValueOnce({data:{items:[entry]},error:null});
  rpc.mockResolvedValue({data:{items:kind==="expired"?[]:[{...entry,...(kind==="changed"?{content_version:8}:{id:"other"})}]},error:null});
  const response=await POST(request({entryId:id,currentCard}));
  expect(response.status).toBe(404);
});
test.each([{entryId:id,text:"untrusted"},{entryId:"bad"},{entryId:id,prepareOnly:"yes"},{entryId:id,currentCard:{...currentCard,entryId:id}}])("rejects malformed or text-supplied input %j",async body=>{
  const response=await POST(request(body));
  expect(response.status).toBe(400);expect(rpc).not.toHaveBeenCalled();expect(resolve).not.toHaveBeenCalled();
});
test.each(["unauthenticated","connected","flag-off","limited","scope"])("rejects %s before content/provider work",async kind=>{
  if(kind==="unauthenticated")auth.mockResolvedValue(Response.json({error:"unauthorized"},{status:401}));
  if(kind==="connected")auth.mockResolvedValue({user:{id:"viewer"},principal:{authKind:"connected_client"},supabase:{rpc}});
  if(kind==="flag-off")vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED","false");
  if(kind==="limited")rate.mockReturnValue({allowed:false,retryAfterMs:1000});
  if(kind==="scope")scope.mockReturnValue(Response.json({error:"scope"},{status:403}));
  const response=await POST(request({entryId:id,currentCard}));
  expect(response.status).toBe(kind==="unauthenticated"?401:kind==="limited"?429:403);
  expect(rpc).not.toHaveBeenCalled();expect(resolve).not.toHaveBeenCalled();
});
test("provider failures never reveal provider text",async()=>{
  resolve.mockRejectedValue(new Error("secret provider input"));
  const response=await POST(request());
  expect(response.status).toBe(502);expect(await response.json()).toEqual({error:"entry_audio_unavailable"});
});


test.each([false,true])("node audio is re-resolved after generation (binding remains valid:%s)",async valid=>{
  const node={contentNodeId:"75600000-0000-4000-8000-000000000004",sourceTextFingerprint:"node-fingerprint"};
  const source={...entry,raw:{meanings:[{examples:["Een huis."]}]},platform_v2_identity:{entryId:id,contentNodeBindings:[{...node,kind:"example",sourcePath:"raw.meanings[0].examples[0]"}]}};
  rpc.mockResolvedValueOnce({data:{items:[source]},error:null});
  rpc.mockResolvedValue({data:{items:[valid?source:{...source,platform_v2_identity:{entryId:id,contentNodeBindings:[]}}]},error:null});
  const response=await POST(request({entryId:id,currentCard,node}));
  expect(resolve).toHaveBeenCalledWith("Een huis.",expect.any(Function));
  expect(response.status).toBe(valid?200:404);
});


test.each([6,7])("presentation source version%s must match before generation",async sourceVersion=>{
  const response=await POST(request({entryId:id,sourceVersion}));
  expect(response.status).toBe(sourceVersion===7?200:404);
  if(sourceVersion!==7)expect(resolve).not.toHaveBeenCalled();
});
