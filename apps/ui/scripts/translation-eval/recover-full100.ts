/* eslint-disable no-console */
import path from "node:path";
import fs from "node:fs";
import { prepareRun, executeRun, readJson, writeNew, verifyRun } from "./core";
import { resolveProfile } from "./profiles";
import { hash } from "./evaluate";
import { withTranslationRetries, safeProviderRequestId, retryAfterMs, type TranslationAttemptDiagnostic, type TranslationAttemptLog } from "../../lib/translation/translationRetry";

// Explicit user amendment: one failed original case, at most THREE recovery calls.
async function main() {
  const root = path.resolve(process.cwd(), "../.."), research = path.join(root, "Research/translation-eval"), runs = path.join(research, "runs");
  const original = path.join(runs, "full-validation-luna56-v1"), manifest = verifyRun(original);
  const failure = readJson(path.join(original, "responses/full028-1.json"));
  if (failure.outcome !== "http_500") throw new Error("unexpected_original_failure");
  const suiteId = "full100-recovery-v1", originalSuite = readJson(path.join(original, "suite.json"));
  const suite = { ...originalSuite, suiteId, cases: originalSuite.cases.filter((c: {id:string}) => c.id === "full028") };
  if (suite.cases.length !== 1) throw new Error("invalid_recovery_case");
  const destination = path.join(runs, "full100-recovery-v1"); fs.mkdirSync(destination);
  writeNew(path.join(research, "cases", suiteId + ".json"), suite);
  writeNew(path.join(destination, "protocol.json"), { originalRun:manifest.runId, originalManifestHash:hash(fs.readFileSync(path.join(original,"manifest.json"),"utf8")), originalResponseHash:hash(fs.readFileSync(path.join(original,"responses/full028-1.json"),"utf8")), maxRecoveryCalls:3, originalFirstAttemptUnchanged:true, promptFingerprint:manifest.promptFingerprint });
  const logs: TranslationAttemptLog[] = [];
  let lastDiagnostic: TranslationAttemptDiagnostic = {stage:"request"};
  try {
    await withTranslationRetries(async diagnostic => {
      lastDiagnostic = diagnostic;
      diagnostic.model = manifest.modelProfile.model;
      const index = logs.length + 1, runId = `full100-recovery-luna56-${index}`;
      const {run,manifest:next} = prepareRun(root,runs,{runId,suiteId,promptId:manifest.promptId,modelId:"luna56",repeat:1,maxCalls:1,maxOutputTokens:manifest.maxOutputTokens,deadlineSeconds:600});
      if (next.promptFingerprint !== manifest.promptFingerprint) throw new Error("changed_prompt");
      const profile = resolveProfile(next.modelProfile,"/Users/khrustal/dev/2000nl/.env.local");
      return executeRun(root,run,profile.endpointFingerprint,async body => {
        let response: Response;
        try { response = await fetch(profile.url,{method:"POST",headers:{"Content-Type":"application/json","api-key":profile.key},body:JSON.stringify(body),signal:AbortSignal.timeout(60_000)}); }
        catch (error) {diagnostic.reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network";throw error;}
        diagnostic.stage="response";diagnostic.status=response.status;diagnostic.requestId=safeProviderRequestId(response.headers.get("x-request-id")??response.headers.get("apim-request-id"));diagnostic.retryAfterMs=retryAfterMs(response.headers.get("retry-after"));
        let data:any=null;try {data=await response.json();}catch {diagnostic.reason="invalid_json";}
        if (!response.ok) diagnostic.reason="http_status";
        if (Number.isInteger(data?.usage?.prompt_tokens)) diagnostic.inputTokens=data.usage.prompt_tokens;
        if (Number.isInteger(data?.usage?.completion_tokens)) diagnostic.outputTokens=data.usage.completion_tokens;
        if(response.ok)diagnostic.stage="contract";
        return {ok:response.ok,status:response.status,data};
      });
    },{maxRetries:2,classify:()=>lastDiagnostic.reason==="http_status"?"provider_http_error":lastDiagnostic.reason==="timeout"?"provider_timeout":lastDiagnostic.reason==="network"?"provider_network_error":"provider_response_error",log:event=>{logs.push(event);writeNew(path.join(destination,`attempt-${event.attempt}.json`),event);}});
    writeNew(path.join(destination,"result.json"),{state:"recovered",recoveryCalls:logs.length,originalAttempts:1});
  } catch {writeNew(path.join(destination,"result.json"),{state:"exhausted",recoveryCalls:logs.length,originalAttempts:1});throw new Error("recovery_exhausted_see_safe_logs");}
  console.log(JSON.stringify(readJson(path.join(destination,"result.json"))));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"recovery_failed");process.exitCode=1;});
