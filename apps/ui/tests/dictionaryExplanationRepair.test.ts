import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { planDictionaryExplanationRepair, mergeDictionaryExplanationRepair } from "@/lib/translation/dictionaryExplanationRepair";
import { OpenAITranslator } from "@/lib/translation/openaiTranslator";
import type { DictionaryMeaningTranslationRequestV1 } from "@/lib/translation/dictionaryMeaningTranslationContract";
const request: DictionaryMeaningTranslationRequestV1 = { contractVersion: "dictionary-meaning-translation-v1", entryId: "synthetic", sourceContentFingerprint: "synthetic", sourceLanguageCode: "nl", targetLanguageCode: "ru", headword: { text: "rust", article: null, partOfSpeech: null, partOfSpeechCode: null }, content: [{ fieldId: "definition", role: "definition", text: "kalmte" }, { fieldId: "idiom:0", role: "idiom", text: "tot rust komen" }, { fieldId: "idiom:0:explanation", role: "idiom-explanation", text: "weer kalm worden" }] };
const original = { entryTranslation: { primaryText: "покой", alternativeTexts: [], baseText: "покой", note: null }, contentTranslations: [{ fieldId: "definition", text: "спокойствие" }, { fieldId: "idiom:0", text: "успокоиться", literalText: null }] };
const patch = { contentTranslations: [{ fieldId: "idiom:0:explanation", text: "снова стать спокойным" }] };
const full = { ...original, contentTranslations: [...original.contentTranslations, ...patch.contentTranslations] };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
beforeEach(() => { vi.stubEnv("AZURE_OPENAI_GPT6_LUNA_MODEL", "gpt-6-luna"); });
test("repairs only missing explanations preserving existing translations", () => {
 const plan=planDictionaryExplanationRepair(JSON.stringify(original),request)!;
 expect(plan.missing.map(i=>i.fieldId)).toEqual(["idiom:0:explanation"]);
 expect(JSON.parse(plan.messages[1].content)).toMatchObject({request,previousResponse:original});
 expect(mergeDictionaryExplanationRepair(JSON.stringify(original),JSON.stringify(patch),request,plan.missing)).toEqual(full);
});
test("refuses other defects, duplicates, unknown IDs, and empty text",()=>{
 for(const value of [full,{...original,contentTranslations:[]},{...original,entryTranslation:{}},{...original,contentTranslations:[...original.contentTranslations,original.contentTranslations[0]]},{...original,contentTranslations:[...original.contentTranslations,{fieldId:"unknown",text:"x"}]},{...original,contentTranslations:[{fieldId:"definition",text:""},original.contentTranslations[1]]}])expect(planDictionaryExplanationRepair(JSON.stringify(value),request)).toBeNull();
 expect(planDictionaryExplanationRepair("{",request)).toBeNull();
});
test("repair must satisfy exact missing-field contract",()=>{
 for(const value of [{contentTranslations:[]},{...patch,entryTranslation:null},{contentTranslations:[{fieldId:"definition",text:"overwrite"}]},{contentTranslations:[{...patch.contentTranslations[0],literalText:null}]}])expect(()=>mergeDictionaryExplanationRepair(JSON.stringify(original),JSON.stringify(value),request,request.content.slice(-1))).toThrow();
});
function provider(values:unknown[]){
 vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","luna6");vi.spyOn(console,"info").mockImplementation(()=>{});
 const mock=vi.fn(async()=>new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify(values.shift())}}]}),{status:200}));vi.stubGlobal("fetch",mock);return mock;
}
test("runtime makes one repair, logs safe operation, uses 180s timeout",async()=>{
 const mock=provider([original,patch]);const timers=vi.spyOn(globalThis,"setTimeout");
 const result=await new OpenAITranslator({apiKey:"secret",model:"gpt-6-luna"}).translateDictionaryMeaning(request);
 expect(result.contentTranslations).toEqual(full.contentTranslations);expect(mock).toHaveBeenCalledTimes(2);
 expect(timers.mock.calls.some(call=>call[1]===180000)).toBe(true);
 const logs=JSON.stringify(vi.mocked(console.info).mock.calls);expect(logs).toContain('"operation":"explanation_repair"');expect(logs).not.toContain("снова");
});
test("valid answer costs one request",async()=>{
 const mock=provider([full]);await new OpenAITranslator({apiKey:"secret",model:"gpt-6-luna"}).translateDictionaryMeaning(request);expect(mock).toHaveBeenCalledTimes(1);
});

test("primary transport retries share a four-minute operation budget",async()=>{
 vi.useFakeTimers();vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","luna6");
 vi.spyOn(console,"info").mockImplementation(()=>{});
 const mock=vi.fn((_url,init)=>new Promise((_resolve,reject)=>{init?.signal?.addEventListener("abort",()=>reject(new DOMException("timeout","AbortError")));}));
 vi.stubGlobal("fetch",mock);
 try {
  const verdict=new OpenAITranslator({apiKey:"secret",model:"gpt-6-luna"}).translateDictionaryMeaning(request).catch(error=>error.message);
  await vi.advanceTimersByTimeAsync(240_000);
  expect(await verdict).toMatch(/^provider_timeout:/);
  expect(mock).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
 } finally {vi.useRealTimers();}
});

test("explanation repair receives only the remaining operation budget",async()=>{
 vi.useFakeTimers();vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","luna6");
 vi.spyOn(console,"info").mockImplementation(()=>{});
 let n=0;
 const mock=vi.fn((_url,init)=>new Promise((resolve,reject)=>{
  if(++n===1)setTimeout(()=>resolve(new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify(original)}}]}))),179_000);
  init?.signal?.addEventListener("abort",()=>reject(new DOMException("timeout","AbortError")));
 }));vi.stubGlobal("fetch",mock);
 try {
  const verdict=new OpenAITranslator({apiKey:"secret",model:"gpt-6-luna"}).translateDictionaryMeaning(request).catch(error=>error.message);
  await vi.advanceTimersByTimeAsync(240_000);
  expect(await verdict).toMatch(/^provider_timeout:/);
  expect(mock).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
 } finally {vi.useRealTimers();}
});
test("invalid repair fails without semantic retry loop",async()=>{
 const mock=provider([original,{contentTranslations:[]}]);await expect(new OpenAITranslator({apiKey:"secret",model:"gpt-6-luna"}).translateDictionaryMeaning(request)).rejects.toThrow();expect(mock).toHaveBeenCalledTimes(2);
});

test("normalizes reordered retained fields by ID without changing content",()=>{
 const reordered=JSON.stringify({...original,contentTranslations:[...original.contentTranslations].reverse()});
 const plan=planDictionaryExplanationRepair(reordered,request)!;expect(plan).not.toBeNull();
 expect(mergeDictionaryExplanationRepair(reordered,JSON.stringify(patch),request,plan.missing)).toEqual(full);
});

test("generic translation keeps its original timeout; explicit override is honored",async()=>{
 provider([{translations:["покой"],note:null}]);const timers=vi.spyOn(globalThis,"setTimeout");
 await new OpenAITranslator({apiKey:"secret",model:"gpt-6-luna"}).translate("rust","ru");
 expect(timers.mock.calls.some(call=>call[1]===15000)).toBe(true);
 provider([full]);timers.mockClear();
 await new OpenAITranslator({apiKey:"secret",model:"gpt-6-luna",timeoutMs:1234}).translateDictionaryMeaning(request);
 expect(timers.mock.calls.some(call=>call[1]===1234)).toBe(true);
});
