import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { providerWorkFixture } from "../providerWorkFixtures";
const mocks = vi.hoisted(() => ({ auth:vi.fn(), service:vi.fn(), scope:vi.fn(), translate:vi.fn(), generate:vi.fn() }));
vi.mock("@/lib/platform/serverSupabase", () => ({ getAuthenticatedSupabase:mocks.auth, getPlatformServiceSupabase:mocks.service, requirePlatformScope:mocks.scope,
 jsonNoStore:(v:unknown,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"no-store"}}),withPlatformCors:(_r:unknown,v:unknown)=>v,platformCorsPreflight:()=>new Response() }));
vi.mock("@/lib/translation/translationProvider", () => ({ loadTranslationConfigFromEnv:()=>({models:{openai:"test-model"}}),createTranslator:()=>({provider:"openai",translator:{translateText:mocks.translate}}) }));
vi.mock("@/lib/translation/prompts/promptFingerprint", () => ({getTranslationPromptFingerprint:()=>"synthetic-prompt"}));
vi.mock("@/lib/audio/audioProviderFactory", () => ({ createAudioProvider:()=>({id:"free",generateAudio:mocks.generate}) }));
import { POST as textPost } from "@/app/api/platform/text-translation/route";
import { POST as draftPost } from "@/app/api/platform/translation/route";
import { POST as ttsPost } from "@/app/api/tts/route";
import { POST as audioPost } from "@/app/api/platform/audio/resolve/route";
import { ProviderWorkError } from "@/lib/providers/providerSafety";
const request=(body:unknown)=>new NextRequest("http://localhost/api/test",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
let work:ReturnType<typeof providerWorkFixture>;
beforeEach(()=>{
 vi.clearAllMocks();work=providerWorkFixture();mocks.service.mockReturnValue({supabase:{rpc:work.rpc}});
 mocks.auth.mockResolvedValue({user:{id:"account-a"},principal:{authKind:"first_party"}});mocks.scope.mockReturnValue(null);
 mocks.translate.mockImplementation(async r=>({translations:r.texts.map((text:string)=>`translated:${text}`),literalTranslations:["literal"],note:"note",meta:{providerUsed:"openai",usedFallback:false}}));
 mocks.generate.mockResolvedValue({audioMp3:Buffer.from([7,8])});
});
afterEach(()=>{vi.unstubAllEnvs();});
test.each([textPost,draftPost,ttsPost,audioPost])("auth and scope failures precede cache/provider work",async post=>{
 mocks.auth.mockResolvedValue(Response.json({error:"unauthorized"},{status:401}));
 expect((await post(request({text:"huis",targetLanguageCode:"en",item:{entry:{content:{headword:"huis"}}}}))).status).toBe(401);
 expect(work.rpc).not.toHaveBeenCalled();expect(mocks.translate).not.toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();
 mocks.auth.mockResolvedValue({user:{id:"account-a"},principal:{authKind:"connected_client"}});
 mocks.scope.mockReturnValue(Response.json({error:"insufficient_scope"},{status:403}));
 expect((await post(request({text:"huis",targetLanguageCode:"en",item:{entry:{content:{headword:"huis"}}}}))).status).toBe(403);
 expect(work.rpc).not.toHaveBeenCalled();
});
test("oversized text/context and draft items fail before any admission/provider",async()=>{
 for(const body of [{text:"x".repeat(24601),targetLanguageCode:"en"},{text:"x",contextText:"y".repeat(24600),targetLanguageCode:"en"}]) expect((await textPost(request(body))).status).toBe(400);
 expect((await draftPost(request({targetLang:"en",item:{entry:{content:{headword:"huis",sections:Array.from({length:128},()=>({kind:"meaning",text:"x"}))}}}}))).status).toBe(400);
 expect(work.rpc).not.toHaveBeenCalled();expect(mocks.translate).not.toHaveBeenCalled();
});
test("purpose nonce cannot bust cache; established connected purposes remain accepted",async()=>{
 expect((await textPost(request({text:"huis",purpose:"nonce-123",targetLanguageCode:"en"}))).status).toBe(400);
 expect(work.rpc).not.toHaveBeenCalled();
 for(const purpose of ["youtube-recall","youtube-span-translation","youtube-phrase-practice","pontix-phrase"]){
   expect((await textPost(request({text:"huis",purpose,targetLanguageCode:"en"}))).status).toBe(200);
 }
 expect(mocks.translate).toHaveBeenCalledTimes(4);
});
test("text and rich fields cache successfully; identities and charges are account scoped",async()=>{
 const body={text:"huis",targetLanguageCode:"en",contextText:"synthetic context"};
 const first=await(await textPost(request(body))).json();
 expect(first).toMatchObject({status:"ready",cached:false,translatedText:"translated:huis",literalTranslatedText:"literal",translatorComment:"note",translationPolicyVersion:"platform-text-translation-v3"});
 expect(await(await textPost(request(body))).json()).toMatchObject({translationId:first.translationId,cached:true});
 mocks.auth.mockResolvedValue({user:{id:"account-b"},principal:{authKind:"connected_client"}});
 const second=await(await textPost(request(body))).json();expect(second.translationId).not.toBe(first.translationId);expect(second.cached).toBe(false);
 expect(mocks.translate).toHaveBeenCalledTimes(2);
 expect(work.rpc.mock.calls.filter(([name])=>name==="begin_provider_work_v1").map(([,args])=>args.p_account_id)).toEqual(["account-a","account-a","account-b"]);
});
test("concurrent text requests return pending rather than duplicate provider generation",async()=>{
 let release!:(r:unknown)=>void;mocks.translate.mockImplementation(()=>new Promise(resolve=>{release=resolve}));
 const first=textPost(request({text:"huis",targetLanguageCode:"en"}));await vi.waitFor(()=>expect(mocks.translate).toHaveBeenCalledOnce());
 const second=await textPost(request({text:"huis",targetLanguageCode:"en"}));expect(second.status).toBe(200);expect(await second.json()).toMatchObject({status:"pending",retryAfterMs:1000});
 release({translations:["house"]});expect((await first).status).toBe(200);expect(mocks.translate).toHaveBeenCalledOnce();
});
test("provider outage returns safe502 and records failure; admission denial is429 and consumes no provider",async()=>{
 mocks.translate.mockRejectedValue(new Error("private provider diagnostic"));
 let response=await textPost(request({text:"huis",targetLanguageCode:"en"}));expect(response.status).toBe(502);expect(await response.text()).not.toContain("private provider");
 expect(work.rpc.mock.calls.find(([name])=>name==="finish_provider_work_v1")?.[1]).toMatchObject({p_error_code:"provider_unknown_error"});
 work.rpc.mockImplementation(()=>({abortSignal:()=>Promise.resolve({data:{status:"limited",retryAfterMs:60000},error:null})}));mocks.translate.mockClear();
 response=await textPost(request({text:"other",targetLanguageCode:"en"}));expect(response.status).toBe(429);expect(await response.json()).toMatchObject({error:"rate_limited",retryAfterMs:60000});expect(mocks.translate).not.toHaveBeenCalled();
});
test.each([ttsPost,audioPost])("all public TTS entries share2000character limit and keep legal long phrases",async post=>{
 expect((await post(request({text:"x".repeat(2001)}))).status).toBe(400);expect(mocks.generate).not.toHaveBeenCalled();
 // Admit no external generation: a limiter response still proves a legal long phrase reached shared admission.
 work.rpc.mockImplementation((name)=>({abortSignal:()=>Promise.resolve({data:name==="read_provider_work_v1"?null:{status:"limited",retryAfterMs:1000},error:null})}));
 const response=await post(request({text:"A synthetic phrase. ".repeat(30)}));expect(response.status).toBe(429);expect(response.headers.get("Retry-After")).toBe("1");expect(mocks.generate).not.toHaveBeenCalled();
});
test("invalid safety configuration fails closed before generation",async()=>{
 vi.stubEnv("PROVIDER_TRANSLATION_REQUESTS_PER_MINUTE","0");const response=await textPost(request({text:"huis",targetLanguageCode:"en"}));
 expect(response.status).toBe(503);expect(mocks.translate).not.toHaveBeenCalled();expect(work.rpc).not.toHaveBeenCalled();
});
test("text preserves identity hashes, defaults, caller language preference, and sends context to provider",async()=>{
 const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:{translation_lang:"ru"},error:null})};
 mocks.auth.mockResolvedValue({user:{id:"account-a"},principal:{authKind:"first_party"},supabase:{from:vi.fn(()=>chain)}});
 const first=await(await textPost(request({text:"huis",sourceLanguageCode:"nl",contextText:"context-a"}))).json();
 expect(first).toMatchObject({status:"ready",sourceLanguageCode:"nl",targetLanguageCode:"ru",sourceTextHash:expect.stringMatching(/^[a-f0-9]{64}$/),contextTextHash:expect.stringMatching(/^[a-f0-9]{64}$/)});
 expect(mocks.translate).toHaveBeenCalledWith({texts:["huis"],sourceLanguageCode:"nl",targetLanguageCode:"ru",purpose:"youtube-phrase-practice",contextText:"context-a"});
 const second=await(await textPost(request({text:"huis",sourceLanguageCode:"nl",contextText:"context-b"}))).json();
 expect(second.translationId).not.toBe(first.translationId);expect(second.sourceTextHash).toBe(first.sourceTextHash);expect(second.contextTextHash).not.toBe(first.contextTextHash);
});
test("fallback metadata and optional rich fields survive both generation and cache hit",async()=>{
 mocks.translate.mockResolvedValue({translations:["house"],literalTranslations:["literal house"],note:"synthetic comment",meta:{providerUsed:"deepl",usedFallback:true}});
 const body={text:"huis",targetLanguageCode:"en"};
 const first=await(await textPost(request(body))).json();
 expect(first).toMatchObject({providerUsed:"deepl",usedFallback:true,literalTranslatedText:"literal house",translatorComment:"synthetic comment"});
 expect(await(await textPost(request(body))).json()).toEqual({...first,cached:true});expect(mocks.translate).toHaveBeenCalledOnce();
});
test.each([{text:"huis",targetLanguageCode:"not-a-language"},{text:"huis",targetLanguageCode:"en",sourceLanguageCode:"invalid source"},{text:"huis",targetLanguageCode:"off"},{targetLanguageCode:"en"}])("invalid language or missing text stops before admission %j",async body=>{
 expect((await textPost(request(body))).status).toBe(400);expect(work.rpc).not.toHaveBeenCalled();expect(mocks.translate).not.toHaveBeenCalled();
});
test.each([{translations:[]},{translations:[""]},{translations:["one","two"]}])("mismatched or empty provider output is a closed502, never a ready cache entry",async ({translations})=>{
 mocks.translate.mockResolvedValue({translations});const response=await textPost(request({text:"huis",targetLanguageCode:"en"}));
 expect(response.status).toBe(502);expect(await response.json()).toMatchObject({status:"failed",error:"provider_response_error",translationId:expect.any(String),cached:false});
 expect([...work.rows.values()].every(row=>row.status==="failed")).toBe(true);
});
test("request body byte envelope rejects irrelevant large JSON before provider and admission",async()=>{
 const response=await textPost(request({text:"huis",targetLanguageCode:"en",ignored:"x".repeat(400000)}));
 expect(response.status).toBe(400);expect(await response.json()).toMatchObject({error:"request_too_large"});expect(work.rpc).not.toHaveBeenCalled();
});
test("draft failure keeps its object-shaped translation error contract",async()=>{
 mocks.translate.mockRejectedValue(new Error("private diagnostic"));
 const response=await draftPost(request({targetLang:"en",item:{entry:{content:{headword:"huis"}}}}));
 expect(response.status).toBe(502);expect(await response.json()).toMatchObject({status:"failed",targetLang:"en",error:{code:"translation_failed",message:"provider_unknown_error"}});
});
test("malformed or null legacy TTS JSON is400 before cache/provider",async()=>{
 for(const body of ["{", "null"]){
   const response=await ttsPost(new NextRequest("http://localhost/api/tts",{method:"POST",body}));
   expect(response.status).toBe(400);
 }
 expect(work.rpc).not.toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();
});
