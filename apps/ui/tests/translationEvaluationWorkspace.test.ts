import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { prepareRun, executeRun, evaluateRun, verifyRun, readJson } from "@/scripts/translation-eval/core";
import { evaluateAlternatives } from "@/scripts/translation-eval/evaluate";
import type { EvalCase } from "@/scripts/translation-eval/types";
const root = path.resolve(process.cwd(), "../..");
const temp: string[] = [];
const setup = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "translation-eval-")); temp.push(dir); return prepareRun(root, dir, {runId:"test-run", suiteId:"preflight-v1", promptId:"dictionary-meaning-v3",modelId:"gpt41",repeat:1,maxCalls:3,maxOutputTokens:2200,deadlineSeconds:600}); };
afterEach(() => { for (const dir of temp.splice(0)) fs.rmSync(dir,{recursive:true,force:true}); });
const provider = (body: any) => {
 const payload = JSON.parse(body.messages[1].content);
 const primary = payload.headword.text === "koe" ? "корова" : payload.headword.text === "typisch" ? "странный" : "разговаривать";
 return {ok:true,status:200,data:{model:"gpt-4.1-2025-04-14",choices:[{finish_reason:"stop",message:{content:JSON.stringify({entryTranslation:{primaryText:primary,alternativeTexts: primary === "разговаривать" ? ["беседовать"] : primary === "странный" ? ["необычный"] : [],baseText:primary === "странный" ? "типичный" : primary,note:null},contentTranslations:payload.content.map((c:any)=>({fieldId:c.fieldId,text:"перевод"}))})}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}}};
};
describe("isolated translation evaluation",()=>{
 test("freezes source, prompt, cases and budgets; refuses overwrite or snapshot edits",()=>{
  const {run,manifest}=setup();expect(manifest.jobs).toHaveLength(3);expect(verifyRun(run).promptFingerprint).toBe(manifest.promptFingerprint);
  expect(()=>prepareRun(root,path.dirname(run),{runId:"test-run",suiteId:"preflight-v1",promptId:"dictionary-meaning-v3",modelId:"gpt41",repeat:1,maxCalls:3,maxOutputTokens:2200,deadlineSeconds:600})).toThrow();
  fs.appendFileSync(path.join(run,"suite.json")," ");expect(()=>verifyRun(run)).toThrow("snapshot_changed");
 });
 test("executes once, resumes without another request, preserves evidence and evaluates",async()=>{
  const {run}=setup();const call=vi.fn(async body=>provider(body));
  await executeRun(root,run,"endpoint-hash",call);expect(call).toHaveBeenCalledTimes(3);
  await executeRun(root,run,"endpoint-hash",call);expect(call).toHaveBeenCalledTimes(3);
  const assessment=evaluateRun(run);expect(assessment.summary).toMatchObject({ready:3,hardFailures:0,withUsefulAlternatives:2,inputTokensKnown:300,outputTokensKnown:150,monetaryCost:null});
  expect(assessment.humanApproved).toBe(false);expect(assessment.currentEvaluatorHash).toBe(assessment.evaluatorHash);
  const receipt=path.join(run,`responses/${verifyRun(run).jobs[0].jobId}.json`);fs.appendFileSync(receipt," ");expect(()=>evaluateRun(run)).toThrow("response_changed");
 });
 test("timeout preserves unknown usage and cannot trigger a hidden retry",async()=>{
  const {run}=setup();const call=vi.fn(async()=>{throw new Error("transport failure");});
  await expect(executeRun(root,run,"endpoint-hash",call)).rejects.toThrow("transport_error");
  await expect(executeRun(root,run,"endpoint-hash",call)).rejects.toThrow("failed_attempt_requires_new_run");
  expect(call).toHaveBeenCalledTimes(1);expect(evaluateRun(run).summary.missingUsage).toBe(1);
 });
 test("wrong model and malformed JSON are recorded as failed, not passed",async()=>{
  const {run}=setup();const call=vi.fn(async body=>{const r=provider(body);r.data.model="other-model";return r;});
  await expect(executeRun(root,run,"endpoint-hash",call)).rejects.toThrow("served_model_mismatch");
  expect(evaluateRun(run).summary.hardFailures).toBe(3);
 });
 test("unknown attempt and concurrent execution both fail closed",async()=>{
  const {run,manifest}=setup();const call=vi.fn();fs.mkdirSync(path.join(run,"attempts"));fs.writeFileSync(path.join(run,`attempts/${manifest.jobs[0].jobId}.json`),"{}");
  await expect(executeRun(root,run,"endpoint-hash",call)).rejects.toThrow("unknown_attempt_requires_reconciliation");expect(call).not.toHaveBeenCalled();
  fs.writeFileSync(path.join(run,"execution.lock"),"");await expect(executeRun(root,run,"endpoint-hash",call)).rejects.toThrow();expect(call).not.toHaveBeenCalled();
 });
 test("detects the rejected transliteration candidate and rejects padding controls",()=>{
  const suite=readJson(path.join(root,"Research/translation-eval/cases/development-v1.json"));
  const praten=suite.cases.find((c:EvalCase)=>c.id==="praten_ru");
  const result={entryTranslation:{primaryText:"разговаривать",alternativeTexts:["беседовать"],baseText:"praten",note:null},contentTranslations:[]};
  expect(evaluateAlternatives(praten,result).baseUnexpected).toBe(true);
  const koe=suite.cases.find((c:EvalCase)=>c.id==="koe_ru");expect(evaluateAlternatives(koe,result).controlViolation).toBe(true);
 });
});
