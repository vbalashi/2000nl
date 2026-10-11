import crypto from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { dictionaryTranslationProfile } from "@/lib/translation/dictionaryTranslationProfile";
import { loadTranslationConfigFromEnv, createTranslator } from "@/lib/translation/translationProvider";
import { getOpenAiDictionaryMeaningPromptFingerprint, getOpenAiTranslationPromptFingerprint } from "@/lib/translation/prompts/promptFingerprint";
import { loadPromptText } from "@/lib/translation/prompts/promptLoader";
import { buildDictionaryMeaningTranslationMessages, type DictionaryMeaningTranslationRequestV1 } from "@/lib/translation/dictionaryMeaningTranslationContract";
const request:DictionaryMeaningTranslationRequestV1={contractVersion:"dictionary-meaning-translation-v1",entryId:"synthetic",sourceContentFingerprint:"synthetic-v1",sourceLanguageCode:"nl",targetLanguageCode:"ru",headword:{text:"test",article:null,partOfSpeech:null,partOfSpeechCode:null},content:[{fieldId:"definition",role:"definition",text:"een proef"}]};
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
function azure(){vi.stubEnv("AZURE_OPENAI_ENDPOINT","https://legacy.openai.azure.com");vi.stubEnv("AZURE_OPENAI_API_KEY","legacy-secret");vi.stubEnv("AZURE_OPENAI_DEPLOYMENT","gpt-4.1");vi.stubEnv("AZURE_OPENAI_GPT6_LUNA_ENDPOINT","https://luna.openai.azure.com");vi.stubEnv("AZURE_OPENAI_GPT6_LUNA_API_KEY_PRIMARY","luna-secret");vi.stubEnv("TRANSLATION_PROVIDER","openai");}
describe("one coherent dictionary translation profile",()=>{
 test("defaults dictionary to Luna without switching generic phrase translation",()=>{
  azure();vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","");
  expect(dictionaryTranslationProfile().model).toBe("gpt-6-luna");
  expect(loadTranslationConfigFromEnv({purpose:"dictionary"})).toMatchObject({models:{openai:"gpt-6-luna"},apiKeys:{openai:"luna-secret"},apiUrls:{openai:"https://luna.openai.azure.com/openai/v1/chat/completions"}});
  expect(loadTranslationConfigFromEnv().models?.openai).toBe("gpt-4.1");
 });
 test("rollback selects GPT4.1 model, prompt and a different cache identity together",()=>{
  azure();vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","luna6");const luna=getOpenAiDictionaryMeaningPromptFingerprint();const fragment=getOpenAiTranslationPromptFingerprint();
  vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","gpt41");expect(loadTranslationConfigFromEnv({purpose:"dictionary"}).models?.openai).toBe("gpt-4.1");expect(dictionaryTranslationProfile().systemFile).toContain("gpt41_v4");expect(getOpenAiDictionaryMeaningPromptFingerprint()).not.toBe(luna);expect(getOpenAiTranslationPromptFingerprint()).toBe(fragment);
  vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","legacy");const expected=crypto.createHash("sha256").update([loadPromptText("openai_dictionary_meaning_system_v1.txt"),loadPromptText("openai_dictionary_meaning_user_v1.txt")].join("\n---\n")).digest("hex");expect(getOpenAiDictionaryMeaningPromptFingerprint()).toBe(expected);
 });
 test("prior Luna v5 rollback retains exact prompt and cache identity",()=>{
  azure();vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","luna6-v5");
  const p=dictionaryTranslationProfile();expect(p.systemFile).toContain("luna6_v5");
  const prompt=[loadPromptText(p.systemFile),loadPromptText(p.userFile)].join("\n---\n");
  expect(crypto.createHash("sha256").update(prompt).digest("hex")).toBe("998960f599e9fc5211a6c82b2a9b7fa35a360c12571decef5e1c655e5609e0ec");
  const previous=crypto.createHash("sha256").update(JSON.stringify({model:p.model,settings:p.requestSettings,prompt})).digest("hex");
  expect(getOpenAiDictionaryMeaningPromptFingerprint()).toBe(previous);
  vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","luna6");expect(getOpenAiDictionaryMeaningPromptFingerprint()).not.toBe(previous);
 });
 test("experimental relation prompt never replaces the default v8/high identity",()=>{
  vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","luna6");const baseline=getOpenAiDictionaryMeaningPromptFingerprint();
  vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","luna6-v8-high");expect(getOpenAiDictionaryMeaningPromptFingerprint()).toBe(baseline);
  vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","luna6-v10");expect(getOpenAiDictionaryMeaningPromptFingerprint()).not.toBe(baseline);
 });
 test("unknown or incomplete profile fails closed instead of silently choosing another provider",()=>{
  azure();vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","arbitrary");expect(dictionaryTranslationProfile).toThrow("invalid_dictionary_translation_profile");
  vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","luna6");vi.stubEnv("AZURE_OPENAI_GPT6_LUNA_API_KEY_PRIMARY","");vi.stubEnv("AZURE_OPENAI_GPT6_LUNA_API_KEY","");expect(()=>createTranslator(loadTranslationConfigFromEnv({purpose:"dictionary"}))).toThrow();
 });
 test("runtime prompt bytes and Luna request settings match the frozen research candidate",async()=>{
  azure();vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE","luna6");
  const profile=dictionaryTranslationProfile();const system=loadPromptText(profile.systemFile),user=loadPromptText(profile.userFile);
  expect(crypto.createHash("sha256").update(system+"\n---\n"+user).digest("hex")).toBe("7d1ec722669b566a87e8c7ddfd8bc09272572685edf21b4417c53d8b4ff73340");
  const messages=buildDictionaryMeaningTranslationMessages(request);expect(messages[0].content).toBe(system.trim());expect(JSON.parse(messages[1].content).instructions).toBe(user.trim());
  const mock=vi.fn(async(_url: unknown, _init?: RequestInit)=>new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify({entryTranslation:{primaryText:"проверка",alternativeTexts:[],baseText:"проверка",note:null},contentTranslations:[{fieldId:"definition",text:"проверка"}]})}}],usage:{prompt_tokens:10,completion_tokens:20}}),{status:200}));vi.stubGlobal("fetch",mock);vi.spyOn(console,"info").mockImplementation(()=>{});
  const {translator}=createTranslator(loadTranslationConfigFromEnv({purpose:"dictionary"}));await translator.translateDictionaryMeaning!(request);const body=JSON.parse(mock.mock.calls[0][1]!.body as string);
  expect(body).toMatchObject({model:"gpt-6-luna",reasoning_effort:"high",max_completion_tokens:2200,response_format:{type:"json_object"},messages});expect(body).not.toHaveProperty("temperature");expect(body).not.toHaveProperty("max_tokens");
 });
});
