import React from "react";
import { describe, test, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { buildDictionaryMeaningTranslationRequest, parseDictionaryMeaningTranslationResult } from "@/lib/translation/dictionaryMeaningTranslationContract";
import { buildDictionaryMeaningTranslationArtifact } from "@/lib/translation/dictionaryMeaningTranslationArtifact";
import { sanitizeTranslationOverlay } from "@/lib/translation/translationArtifactSafety";
import { projectPlatformV2SenseContent } from "@/lib/platform/projections/platformV2SenseContent";
import { ArticleContentNode } from "@/components/practice/article/ArticleContent";
import { cowIdiomGateContent } from "@/lib/platform/fixtures/idiomHeadwordGateFixture";
const request = buildDictionaryMeaningTranslationRequest({entryId:"cow",sourceContentFingerprint:"v1",sourceLanguageCode:"nl",targetLanguageCode:"ru",word:{headword:"koe",part_of_speech:"zn",raw:{meanings:[{definition:"een dier",idioms:[{expression:"over koetjes en kalfjes praten",explanation:"over onbelangrijke dingen praten"},{expression:"iets anders"}]}]}}});
const result = (literal: unknown = "говорить о коровках и телятах") => ({entryTranslation:{primaryText:"корова",alternativeTexts:[] as string[],baseText:"корова",note:null},contentTranslations:request.content.map(item=>({fieldId:item.fieldId,text:`translated ${item.fieldId}`,...(item.role==="idiom"?{literalText:literal}:{})}))});
describe("optional idiom literal translation",()=>{
 test("reserves idiom explanations before large standalone examples and drops budget fragments",()=>{
  const word={headword:"koe",part_of_speech:"zn",raw:{meanings:[{definition:"een dier",examples:Array.from({length:20},()=>"Een lange zin over een koe in het weiland. ".repeat(4)),idioms:[{expression:"over koetjes en kalfjes praten",explanation:"gezellig praten over onbelangrijke dingen"}]}]}};
  const bounded=buildDictionaryMeaningTranslationRequest({entryId:"cow",sourceContentFingerprint:"v1",sourceLanguageCode:"nl",targetLanguageCode:"ru",word});
  expect(bounded.content.find(c=>c.fieldId==="idiom:0:explanation")?.text).toBe("gezellig praten over onbelangrijke dingen");
  expect(bounded.content.filter(c=>c.role==="example").every(c=>c.text===word.raw.meanings[0].examples[0].trim())).toBe(true);
 });
 test("preserves alternatives and separate literal fields through JSON storage, including multiple idioms",()=>{
  const payload=result();payload.entryTranslation.alternativeTexts=["бурёнка"];
  const parsed=parseDictionaryMeaningTranslationResult(JSON.stringify(payload),request);
  const overlay=JSON.parse(JSON.stringify(sanitizeTranslationOverlay(buildDictionaryMeaningTranslationArtifact(parsed))));
  expect(overlay.entryTranslation.alternativeTexts).toEqual(["бурёнка"]);
  expect(overlay.meanings[0].idioms[0]).toEqual({expression:"translated idiom:0",literalText:"говорить о коровках и телятах",explanation:"translated idiom:0:explanation"});
  expect(overlay.meanings[0].idioms[1].literalText).toBe("говорить о коровках и телятах");
 });
 test.each([null,undefined])("accepts absent or null literal without inventing it: %s",literal=>{
  const payload=result(null);if(literal===undefined)payload.contentTranslations.forEach(item=>delete item.literalText);
  const parsed=parseDictionaryMeaningTranslationResult(JSON.stringify(payload),request);
  expect(buildDictionaryMeaningTranslationArtifact(parsed).meanings?.[0].idioms?.[0]).not.toHaveProperty("literalText");
 });
 test.each(["",123,"x".repeat(1201)])("rejects malformed literal: %s",literal=>expect(()=>parseDictionaryMeaningTranslationResult(JSON.stringify(result(literal)),request)).toThrow());
 test("rejects attaching literal to a definition",()=>{const payload=result();Object.assign(payload.contentTranslations[0],{literalText:"wrong"});expect(()=>parseDictionaryMeaningTranslationResult(JSON.stringify(payload),request)).toThrow("only on idiom");});
 test("projects literal only alongside the exact fresh natural translation",()=>{
  const expression=structuredClone(cowIdiomGateContent.expression);expression.translations[0].literalText="говорить о коровках и телятах";
  const project=()=>projectPlatformV2SenseContent({capabilities:[],contentNodes:[expression]}).rootNodes[0];
  expect(project().literalTranslation).toBe("говорить о коровках и телятах");
  expression.translations[0].sourceTextFingerprint="old";expect(project()).not.toHaveProperty("literalTranslation");
 });
 test.each([["ru","дословно"],["en","literally"],["nl","letterlijk"]] as const)("renders natural first and localized optional literal with common visibility: %s",(language,label)=>{
  cleanup(); const node={contentNodeId:"idiom",parentContentNodeId:null,kind:"idiom" as const,text:"over koetjes en kalfjes praten",translation:"говорить о пустяках",literalTranslation:"говорить о коровках и телятах",children:[]};
  const {rerender,container}=render(<ArticleContentNode node={node} interfaceLanguage={language} translationLanguage="ru" translationVisible/>);
  const natural=screen.getByText("говорить о пустяках"),literal=container.querySelector("[data-literal-translation]")!;
  expect(literal).toHaveTextContent(`(${label}: говорить о коровках и телятах)`);
  expect(natural.compareDocumentPosition(literal)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  rerender(<ArticleContentNode node={node} interfaceLanguage={language} translationVisible={false}/>);
  expect(literal.closest('[aria-hidden="true"]')).not.toBeNull();
 });
});
