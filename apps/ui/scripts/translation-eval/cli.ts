/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { prepareRun, executeRun, evaluateRun, readJson, writeNew, verifyRun } from "./core";
import { resolveProfile } from "./profiles";
import { hash } from "./evaluate";
const arg = (flag: string, fallback?: string) => { const i = process.argv.indexOf(flag); return i < 0 ? fallback : process.argv[i + 1]; };
const id = (value: string | undefined) => { if (!value || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error("invalid_or_missing_id"); return value; };
const root = path.resolve(process.cwd(), "../..");
const research = path.join(root, "Research/translation-eval");
const runs = path.join(research, "runs");
const runPath = () => path.join(runs, id(arg("--run")));
const failureCodes = ["sense-mismatch", "weak-equivalent", "wrong-language", "base-translation-error", "content-translation-error", "unnatural-language", "missing-useful-equivalent", "unnecessary-alternative"];

async function main() {
  const command = process.argv[2];
  if (command === "prepare") {
    const options = { runId: id(arg("--run")), suiteId: id(arg("--suite", "development-v1")),
      promptId: id(arg("--prompt", "dictionary-meaning-v3")), modelId: id(arg("--model", "gpt41")),
      repeat: Number(arg("--repeat", "1")), maxCalls: Number(arg("--max-calls", "12")),
      maxOutputTokens: Number(arg("--max-output-tokens", "2200")), deadlineSeconds: Number(arg("--deadline-seconds", "600")) };
    if (!process.argv.includes("--write")) { console.log(JSON.stringify({ dryRun: true, options, providerCalls: 0 }, null, 2)); return; }
    fs.mkdirSync(runs, { recursive: true });
    console.log(JSON.stringify(prepareRun(root, runs, options), null, 2));
    return;
  }
  if (command === "execute") {
    const run = runPath(); const manifest = verifyRun(run);
    if (!process.argv.includes("--live")) { console.log(JSON.stringify({ dryRun: true, manifest, providerCalls: 0 }, null, 2)); return; }
    const profile = resolveProfile(manifest.modelProfile, arg("--project-env", "/Users/khrustal/dev/2000nl/.env.local")!);
    console.log(JSON.stringify(await executeRun(root, run, profile.endpointFingerprint, async body => {
      const response = await fetch(profile.url, { method: "POST", headers: { "Content-Type": "application/json", "api-key": profile.key },
        body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
      let data: unknown = null; try { data = await response.json(); } catch { /* Save explicit failure without credential-bearing error bodies. */ }
      return { ok: response.ok, status: response.status, data };
    })));
    return;
  }
  if (command === "evaluate") {
    const run = runPath(), assessment = evaluateRun(run);
    if (process.argv.includes("--write")) writeNew(path.join(run, "assessments", id(arg("--assessment", "automatic-v1")) + ".json"), assessment);
    console.log(JSON.stringify(assessment, null, 2)); return;
  }
  if (command === "review-template") {
    const run = runPath(), assessment = evaluateRun(run);
    const review = { schemaVersion: "translation-eval-review-v1", runId: assessment.runId,
      reviewer: "", method: "agent", reviewedAt: "", manifestHash: assessment.manifestHash,
      items: assessment.rows.filter(row => row.outcome === "ready").map(row => ({ jobId: row.jobId,
        responseHash: row.responseHash, decision: "pending", scores: { senseFidelity: null, equivalentUsefulness: null, naturalness: null, contentFidelity: null, baseCorrectness: null }, failureCodes: [], rationale: "" })) };
    if (process.argv.includes("--write")) writeNew(path.join(run, "review-drafts", id(arg("--review", "review-v1")) + ".json"), review);
    console.log(JSON.stringify(review, null, 2)); return;
  }
  if (command === "submit-review") {
    const run = runPath(), assessment = evaluateRun(run), review = readJson(arg("--file")!);
    if (review.schemaVersion !== "translation-eval-review-v1" || review.runId !== assessment.runId || review.manifestHash !== assessment.manifestHash || !review.reviewer || !["agent", "human", "model"].includes(review.method) || !Number.isFinite(Date.parse(review.reviewedAt)) || !Array.isArray(review.items)) throw new Error("invalid_review");
    const ready = assessment.rows.filter(row => row.outcome === "ready");
    if (review.items.length !== ready.length || new Set(review.items.map((i: any) => i.jobId)).size !== ready.length) throw new Error("incomplete_review");
    for (const item of review.items) {
      const row = ready.find(r => r.jobId === item.jobId);
      if (!row || row.responseHash !== item.responseHash || !["accept", "reject", "needs-work"].includes(item.decision) || !item.rationale?.trim() || !Array.isArray(item.failureCodes) || item.failureCodes.some((c: string) => !failureCodes.includes(c))) throw new Error("unbound_review");
      const fields = ["senseFidelity", "equivalentUsefulness", "naturalness", "contentFidelity", "baseCorrectness"];
      if (!item.scores || Object.keys(item.scores).length !== fields.length || fields.some(k => !Number.isInteger(item.scores[k]) || item.scores[k] < 0 || item.scores[k] > 5)) throw new Error("invalid_review_scores");
      if (item.decision === "accept" && (fields.some(k => item.scores[k] < 4) || item.failureCodes.length)) throw new Error("review_acceptance_threshold_failed");
      if (item.decision !== "accept" && !item.failureCodes.length) throw new Error("review_failure_code_required");
    }
    if (!process.argv.includes("--write")) { console.log(JSON.stringify({ dryRun: true, valid: true })); return; }
    writeNew(path.join(run, "reviews", id(arg("--review", "review-v1")) + ".json"), review); console.log("review_saved"); return;
  }
  if (command === "compare") {
    const runIds = (arg("--runs") ?? "").split(",").map(id);
    if (runIds.length < 2) throw new Error("at_least_two_runs_required");
    const entries = runIds.map(runId => { const run = path.join(runs, runId); return { manifest: verifyRun(run), assessment: evaluateRun(run) }; });
    const key = (entry: typeof entries[number]) => {
      const suite = readJson(path.join(runs, entry.manifest.runId, "suite.json"));
      return hash(JSON.stringify({ suite, repeat: entry.manifest.repeat, maxOutputTokens: entry.manifest.maxOutputTokens }));
    };
    if (entries.some(e => key(e) !== key(entries[0]))) throw new Error("incompatible_suites_or_repeats");
    const comparison = { schemaVersion: "translation-eval-comparison-v1", reviewStatus: "automatic-checks-only", humanApproved: false,
      comparisonKey: key(entries[0]), runs: entries.map(e => ({ runId: e.manifest.runId, manifestHash: e.assessment.manifestHash,
        model: e.manifest.modelProfile.model, settings: e.manifest.modelProfile.requestSettings,
        promptId: e.manifest.promptId, promptFingerprint: e.manifest.promptFingerprint, summary: e.assessment.summary })),
      caveats: ["Development results are not held-out validation", "One draw does not establish model reliability", "No verified Azure tariff; monetary cost is unknown", "No automatic production promotion"] };
    if (process.argv.includes("--write")) writeNew(path.join(research, "comparisons", id(arg("--comparison")) + ".json"), comparison);
    console.log(JSON.stringify(comparison, null, 2)); return;
  }
  throw new Error("use_prepare_execute_evaluate_review-template_submit-review_compare");
}
main().catch(error => { console.error(error instanceof Error && /^[a-z][a-z0-9_-]*$/.test(error.message) ? error.message : "translation_eval_failed_no_automatic_retry"); process.exitCode = 1; });
