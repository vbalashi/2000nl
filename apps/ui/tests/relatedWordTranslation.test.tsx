import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { buildDictionaryMeaningTranslationRequest, parseDictionaryMeaningTranslationResult } from "@/lib/translation/dictionaryMeaningTranslationContract";
import { buildDictionaryMeaningTranslationArtifact } from "@/lib/translation/dictionaryMeaningTranslationArtifact";
import { sanitizeTranslationOverlay } from "@/lib/translation/translationArtifactSafety";
import { contentFingerprint, normalizeDictionaryContent } from "@/lib/platform/projections/dictionaryContent";
import { projectPlatformV2WordDetails, platformV2ContentRevision } from "@/lib/platform/platformV2RichContent";
import { projectLexicalRelationTranslations, withLexicalRelationTranslations } from "@/lib/platform/platformV2LexicalRelationTranslations";
import { resolvePlatformV2Translations } from "@/lib/platform/platformV2TranslationService";
import { translationPolicyVersion } from "@/lib/translation/translationPolicy";
import { lexicalRelationDetail } from "@/components/practice/article/wordDetailsPresentation";
import { ArticleSenseRelations } from "@/components/practice/article/ArticleWordDetails";

const entry = { id:"hot", headword:"heet", language_code:"nl", part_of_speech:"bn", raw:{meanings:[{
  definition:"met een zeer hoge temperatuur", synonyms:[" warm ","", "warm", "gloeiend"], antonyms:["koud"],
}]}};
const requestFor=(word:typeof entry=entry)=>buildDictionaryMeaningTranslationRequest({entryId:word.id,sourceContentFingerprint:contentFingerprint(normalizeDictionaryContent(word)),sourceLanguageCode:"nl",targetLanguageCode:"ru",word});
const identity={translationId:"row-hot",targetLanguageCode:"ru",status:"ready" as const,translationPolicyVersion:"policy",providerRevision:"revision"};
const overlay={meanings:[{synonyms:["тёплый","раскалённый"],antonyms:["холодный"]}]};
const translatedDetails=()=>withLexicalRelationTranslations(projectPlatformV2WordDetails(entry,[]),projectLexicalRelationTranslations({entryId:entry.id,meaning:entry.raw.meanings[0],overlay,identity}))!;
afterEach(()=>{cleanup();vi.unstubAllEnvs();});

describe("related-word translation contract and identity",()=>{
  test("uses existing normalized relations, with exact role and per-term identity",()=>{
    expect(requestFor().content.filter(c=>c.role==="synonym"||c.role==="antonym")).toEqual([
      {fieldId:"synonym:0",role:"synonym",text:"warm"},
      {fieldId:"synonym:1",role:"synonym",text:"gloeiend"},
      {fieldId:"antonym:0",role:"antonym",text:"koud"},
    ]);
  });
  test("roundtrips through strict contract, sanitizer and JSON without shifting skipped positions",()=>{
    const word=structuredClone(entry);word.raw.meanings[0].synonyms=["x".repeat(650),"warm"];
    const request=requestFor(word);
    expect(request.content.some(c=>c.fieldId==="synonym:0")).toBe(false);
    expect(request.content.find(c=>c.fieldId==="synonym:1")?.text).toBe("warm");
    const result=parseDictionaryMeaningTranslationResult(JSON.stringify({entryTranslation:{primaryText:"горячий",alternativeTexts:[],baseText:"горячий",note:null},contentTranslations:request.content.map(c=>({fieldId:c.fieldId,text:c.fieldId==="synonym:1"?"тёплый":"перевод"}))}),request);
    const stored=JSON.parse(JSON.stringify(sanitizeTranslationOverlay(buildDictionaryMeaningTranslationArtifact(result))));
    expect(stored.meanings[0].synonyms).toEqual([null,"тёплый"]);
    const translated=withLexicalRelationTranslations(projectPlatformV2WordDetails(word,[]),projectLexicalRelationTranslations({entryId:word.id,meaning:word.raw.meanings[0],overlay:stored,identity}))!;
    const shown=lexicalRelationDetail(translated,"ru").synonyms;
    expect(shown[0]).not.toHaveProperty("translation");expect(shown[1]).toMatchObject({text:"warm",translation:"тёплый"});
  });
  test("rejects reordering, inventing relations and literal fields on a relation",()=>{
    const request=requestFor();const payload={entryTranslation:{primaryText:"горячий",alternativeTexts:[],baseText:"горячий",note:null},contentTranslations:request.content.map(c=>({fieldId:c.fieldId,text:"перевод"}))};
    const wrongOrder=structuredClone(payload);[wrongOrder.contentTranslations[1],wrongOrder.contentTranslations[2]]=[wrongOrder.contentTranslations[2],wrongOrder.contentTranslations[1]];
    expect(()=>parseDictionaryMeaningTranslationResult(JSON.stringify(wrongOrder),request)).toThrow();
    const extra=structuredClone(payload);extra.contentTranslations.push({fieldId:"synonym:99",text:"invented"});
    expect(()=>parseDictionaryMeaningTranslationResult(JSON.stringify(extra),request)).toThrow();
    Object.assign(payload.contentTranslations[1],{literalText:"wrong"});
    expect(()=>parseDictionaryMeaningTranslationResult(JSON.stringify(payload),request)).toThrow("only on idiom");
  });
  test("relation changes invalidate entry cache; blanks/duplicates do not change canonical identity",()=>{
    const revision=contentFingerprint(normalizeDictionaryContent(entry));
    const changed=structuredClone(entry);changed.raw.meanings[0].synonyms=["ander"];
    expect(contentFingerprint(normalizeDictionaryContent(changed))).not.toBe(revision);
    const normalized=structuredClone(entry);normalized.raw.meanings[0].synonyms=["warm","gloeiend"];
    expect(contentFingerprint(normalizeDictionaryContent(normalized))).toBe(revision);
    const empty={...entry,raw:{meanings:[{definition:"met een zeer hoge temperatuur"}]}};
    expect(contentFingerprint(normalizeDictionaryContent(empty))).toBe(contentFingerprint(normalizeDictionaryContent({...empty,raw:{meanings:[{...empty.raw.meanings[0],synonyms:[],antonyms:[]}]}})));
  });
  test("translation enrichment never mutates source wordDetails/revision",()=>{
    const source=projectPlatformV2WordDetails(entry,[])!;
    const revision=platformV2ContentRevision(entry.id,[],source,null);
    const enriched=withLexicalRelationTranslations(source,projectLexicalRelationTranslations({entryId:entry.id,meaning:entry.raw.meanings[0],overlay,identity}));
    expect(platformV2ContentRevision(entry.id,[],enriched,null)).toBe(revision);
    expect(enriched).not.toBe(source);expect(source.lexicalRelations[0]).not.toHaveProperty("translations");
    expect(platformV2ContentRevision(entry.id,[],source,null)).toBe(revision);
  });
  test.each(["pending","failed"] as const)("never renders text from a %s overlay",status=>{
    const details=withLexicalRelationTranslations(projectPlatformV2WordDetails(entry,[]),projectLexicalRelationTranslations({entryId:entry.id,meaning:entry.raw.meanings[0],overlay,identity:{...identity,status}}))!;
    expect(lexicalRelationDetail(details,"ru").synonyms.every(r=>!r.translation)).toBe(true);
  });
  test("target language, relation kind and source fingerprint stay exact",()=>{
    const details=translatedDetails();expect(lexicalRelationDetail(details,"ru").antonyms[0]).toMatchObject({text:"koud",translation:"холодный"});
    expect(lexicalRelationDetail(details,"en").synonyms[0]).not.toHaveProperty("translation");
    details.lexicalRelations[0].translations![0].sourceTextFingerprint="stale";
    expect(lexicalRelationDetail(details,"ru").synonyms[0]).not.toHaveProperty("translation");
    expect(lexicalRelationDetail(details,"ru").synonyms[1].translation).toBe("раскалённый");
  });
  test.each(["fresh","changed-source","changed-policy","legacy"])("reloads overlay with %s identity",async variant=>{
    vi.stubEnv("TRANSLATION_PROVIDER","openai");
    const request=requestFor();const row={id:"row-hot",word_entry_id:entry.id,target_lang:"ru",provider:"openai",status:"ready",overlay:JSON.parse(JSON.stringify(overlay)),source_content_revision:variant==="changed-source"?"old":variant==="legacy"?null:request.sourceContentFingerprint,translation_policy_version:variant==="changed-policy"?"old":translationPolicyVersion("openai",request)};
    const query:any={select:()=>query,in:()=>query,eq:()=>query,then:(resolve:any)=>Promise.resolve({data:[row],error:null}).then(resolve)};
    const result=await resolvePlatformV2Translations({supabase:{from:()=>query}} as any,{entries:[entry],bindingsByEntryId:new Map(),targetLanguageCode:"ru"});
    expect(result.ok).toBe(true);if(!result.ok)return;
    const projection=result.byEntryId.get(entry.id)!;
    const details=withLexicalRelationTranslations(projectPlatformV2WordDetails(entry,[]),projection.relationTranslationsById)!;
    expect(lexicalRelationDetail(details,"ru").synonyms[0].translation).toBe(variant==="fresh"?"тёплый":undefined);
  });
});

test("source words stay visible; per-word translations follow the shared switch and language",()=>{
  const props={relation:lexicalRelationDetail(translatedDetails(),"ru"),interfaceLanguage:"en" as const,contentLanguage:"nl",translationLanguage:"ru"};
  const {rerender}=render(<ArticleSenseRelations {...props}/>);
  expect(screen.getByText("warm")).toBeVisible();expect(screen.getByText("warm")).toHaveAttribute("lang","nl");
  expect(screen.getByText("(тёплый)")).not.toBeVisible();
  rerender(<ArticleSenseRelations {...props} translationVisible/>);
  expect(screen.getByText("(тёплый)")).toBeVisible();expect(screen.getByText("(тёплый)")).toHaveAttribute("lang","ru");
  expect(screen.getByText("(холодный)")).toBeVisible();
  rerender(<ArticleSenseRelations {...props} translationVisible={false}/>);
  expect(screen.getByText("(холодный)")).not.toBeVisible();expect(screen.getByText("koud")).toBeVisible();
});
