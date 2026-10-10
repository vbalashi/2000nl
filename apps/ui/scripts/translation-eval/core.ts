import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildDictionaryMeaningTranslationMessages, parseDictionaryMeaningTranslationResult } from "../../lib/translation/dictionaryMeaningTranslationContract";
import { evaluateAlternatives, hash } from "./evaluate";
import type { EvalCase, ModelProfile, RunManifest } from "./types";

const safeId = (value: string) => { if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error("invalid_id"); return value; };
export const readJson = (filename: string) => JSON.parse(fs.readFileSync(filename, "utf8"));
export function writeNew(filename: string, value: unknown) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
const sourcePaths = [
  "apps/ui/scripts/translation-eval/core.ts", "apps/ui/scripts/translation-eval/evaluate.ts",
  "apps/ui/scripts/translation-eval/profiles.ts", "apps/ui/scripts/translation-eval/types.ts",
  "apps/ui/scripts/translation-eval/cli.ts",
  "apps/ui/lib/translation/dictionaryMeaningTranslationContract.ts",
  "apps/ui/lib/translation/prompts/promptLoader.ts",
  "apps/ui/lib/translation/dictionaryTranslationContext.ts",
];
export function prepareRun(root: string, runsRoot: string, options: {
  runId: string; suiteId: string; promptId: string; modelId: string;
  repeat: number; maxCalls: number; maxOutputTokens: number; deadlineSeconds: number;
}) {
  const research = path.join(root, "Research/translation-eval");
  const suite = readJson(path.join(research, "cases", safeId(options.suiteId) + ".json"));
  if (suite.schemaVersion !== "translation-eval-suite-v1" || suite.suiteId !== options.suiteId ||
      !["development", "validation"].includes(suite.split) || !Array.isArray(suite.cases) || !suite.cases.length) throw new Error("invalid_suite");
  const cases = suite.cases as EvalCase[];
  if (new Set(cases.map(c => c.id)).size !== cases.length || cases.some(c => !c.id || !Array.isArray(c.allowedStems) || !Array.isArray(c.baseAllowedStems) || typeof c.alternativesUseful !== "boolean")) throw new Error("invalid_cases");
  const profiles = readJson(path.join(research, "model-profiles.json")).profiles as ModelProfile[];
  const profile = profiles.find(p => p.id === options.modelId);
  if (!profile) throw new Error("unknown_model_profile");
  if (![options.repeat, options.maxCalls, options.maxOutputTokens, options.deadlineSeconds].every(Number.isInteger) || options.repeat < 1 || options.repeat > 5 || options.maxCalls < cases.length * options.repeat || options.maxCalls > 100 || options.maxOutputTokens < 256 || options.maxOutputTokens > 4000 || options.deadlineSeconds < 60 || options.deadlineSeconds > 3600) throw new Error("invalid_budget");
  const promptDir = path.join(research, "prompts", safeId(options.promptId));
  const system = fs.readFileSync(path.join(promptDir, "system.txt"), "utf8");
  const user = fs.readFileSync(path.join(promptDir, "user.txt"), "utf8");
  if (!system.trim() || !user.trim()) throw new Error("empty_prompt");
  const run = path.join(runsRoot, safeId(options.runId));
  fs.mkdirSync(run, { recursive: false }); // Existing runs are never replaced.
  const snapshotHashes: Record<string, string> = {};
  const snapshot = (filename: string, value: unknown) => {
    writeNew(path.join(run, filename), value);
    snapshotHashes[filename] = hash(fs.readFileSync(path.join(run, filename), "utf8"));
  };
  snapshot("suite.json", suite);
  snapshot("prompt.json", { system, user });
  const sourceHashes = Object.fromEntries(sourcePaths.map(filename => [filename, hash(fs.readFileSync(path.join(root, filename), "utf8"))]));
  for (const [filename, sha] of Object.entries(sourceHashes)) {
    snapshot(`source/${filename}.json`, { path: filename, sha256: sha, text: fs.readFileSync(path.join(root, filename), "utf8") });
  }
  const jobs = cases.flatMap(item => Array.from({ length: options.repeat }, (_, repetition) => {
    const jobId = `${item.id}-${repetition + 1}`;
    if (!/^[a-z0-9_-]+$/.test(jobId)) throw new Error("invalid_case_id");
    const messages = buildDictionaryMeaningTranslationMessages(item.request);
    messages[0].content = system.trim();
    const userPayload = JSON.parse(messages[1].content);
    userPayload.instructions = user.trim(); messages[1].content = JSON.stringify(userPayload);
    // Validate all contract fields/order using a structurally aligned placeholder response.
    parseDictionaryMeaningTranslationResult(JSON.stringify({ entryTranslation: null, contentTranslations: item.request.content.map(c => ({ fieldId: c.fieldId, text: "fixture" })) }), item.request);
    snapshot(`jobs/${jobId}.json`, { item, messages });
    return { jobId, caseId: item.id, repetition: repetition + 1 };
  }));
  const manifest: RunManifest = {
    schemaVersion: "translation-eval-run-v1", runId: options.runId, createdAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    sourceDirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()),
    suiteId: suite.suiteId, split: suite.split, promptId: options.promptId,
    promptFingerprint: hash([system, user].join("\n---\n")), modelProfile: profile,
    repeat: options.repeat, maxCalls: options.maxCalls, maxOutputTokens: options.maxOutputTokens,
    deadlineSeconds: options.deadlineSeconds, sourceHashes, snapshotHashes, jobs,
  };
  writeNew(path.join(run, "manifest.json"), manifest);
  fs.writeFileSync(path.join(run, "manifest.sha256"), hash(fs.readFileSync(path.join(run, "manifest.json"), "utf8")) + "\n", { flag: "wx", mode: 0o600 });
  return { run, manifest };
}
export function verifyRun(run: string) {
  const manifest = readJson(path.join(run, "manifest.json")) as RunManifest;
  if (hash(fs.readFileSync(path.join(run, "manifest.json"), "utf8")) !== fs.readFileSync(path.join(run, "manifest.sha256"), "utf8").trim()) throw new Error("manifest_changed");
  for (const [filename, sha] of Object.entries(manifest.snapshotHashes)) {
    if (hash(fs.readFileSync(path.join(run, filename), "utf8")) !== sha) throw new Error("snapshot_changed");
  }
  return manifest;
}
export async function executeRun(root: string, run: string, endpointFingerprint: string,
  call: (body: unknown) => Promise<{ ok: boolean; status: number; data: any }>) {
  const manifest = verifyRun(run);
  for (const [filename, sha] of Object.entries(manifest.sourceHashes)) {
    if (hash(fs.readFileSync(path.join(root, filename), "utf8")) !== sha) throw new Error("executor_changed_create_new_run");
  }
  const saveReceipt = (filename: string, value: unknown) => {
    writeNew(filename, value);
    fs.writeFileSync(filename + ".sha256", hash(fs.readFileSync(filename, "utf8")) + "\n", { flag: "wx", mode: 0o600 });
  };
  const lock = path.join(run, "execution.lock");
  const fd = fs.openSync(lock, "wx", 0o600);
  try {
    const binding = path.join(run, "endpoint.json");
    if (fs.existsSync(binding)) { if (readJson(binding).fingerprint !== endpointFingerprint) throw new Error("endpoint_changed"); }
    else writeNew(binding, { fingerprint: endpointFingerprint });
    const clock = path.join(run, "started-at.json");
    if (!fs.existsSync(clock)) writeNew(clock, { at: Date.now() });
    const deadline = readJson(clock).at + manifest.deadlineSeconds * 1000;
    for (const job of manifest.jobs) {
      const receipt = path.join(run, `responses/${job.jobId}.json`);
      if (fs.existsSync(receipt)) { if (readJson(receipt).outcome !== "ready") throw new Error("failed_attempt_requires_new_run"); continue; }
      const attempt = path.join(run, `attempts/${job.jobId}.json`);
      if (fs.existsSync(attempt)) throw new Error("unknown_attempt_requires_reconciliation");
      if (Date.now() >= deadline) throw new Error("deadline_exceeded");
      const usedCalls = fs.existsSync(path.join(run, "attempts")) ? fs.readdirSync(path.join(run, "attempts")).length : 0;
      if (usedCalls >= manifest.maxCalls) throw new Error("call_budget_exceeded");
      const snapshot = readJson(path.join(run, `jobs/${job.jobId}.json`));
      const body = { model: manifest.modelProfile.model, ...manifest.modelProfile.requestSettings,
        ...(manifest.modelProfile.id === "gpt41" ? { max_tokens: manifest.maxOutputTokens } : { max_completion_tokens: manifest.maxOutputTokens }),
        messages: snapshot.messages };
      writeNew(attempt, { at: new Date().toISOString(), body, bodyFingerprint: hash(JSON.stringify(body)) });
      const started = Date.now();
      let response: { ok: boolean; status: number; data: any };
      try { response = await call(body); }
      catch { saveReceipt(receipt, { outcome: "transport_error", unknownUsage: true, elapsedMs: Date.now() - started }); throw new Error("transport_error"); }
      const data = response.data;
      const rawContent = data?.choices?.[0]?.message?.content ?? null;
      let result = null; let outcome = "ready";
      if (!response.ok) outcome = `http_${response.status}`;
      else if (data?.choices?.[0]?.finish_reason !== "stop") outcome = "incomplete_response";
      else if (typeof data.model !== "string" || !(data.model === manifest.modelProfile.model || data.model.startsWith(manifest.modelProfile.model + "-"))) outcome = "served_model_mismatch";
      else try { result = parseDictionaryMeaningTranslationResult(rawContent ?? "", snapshot.item.request); }
      catch { outcome = "contract_invalid"; }
      const values = { outcome, requestedModel: manifest.modelProfile.model, servedModel: data?.model ?? null,
        usage: data?.usage ?? null, elapsedMs: Date.now() - started, rawContent, result,
        unknownUsage: !data?.usage, bodyFingerprint: hash(JSON.stringify(body)) };
      saveReceipt(receipt, values);
      if (outcome !== "ready") throw new Error(outcome);
    }
    return { state: "completed", calls: manifest.jobs.length };
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}

export function evaluateRun(run: string) {
  const manifest = verifyRun(run);
  type AssessmentRow = RunManifest["jobs"][number] & {
    outcome: string; evaluation?: ReturnType<typeof evaluateAlternatives>;
    result?: ReturnType<typeof parseDictionaryMeaningTranslationResult>;
    usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
    elapsedMs?: number; responseHash?: string;
  };
  const rows = manifest.jobs.map<AssessmentRow>(job => {
    const snapshot = readJson(path.join(run, `jobs/${job.jobId}.json`));
    const filename = path.join(run, `responses/${job.jobId}.json`);
    if (!fs.existsSync(filename)) return { ...job, outcome: "missing" };
    const responseHash = hash(fs.readFileSync(filename, "utf8"));
    if (responseHash !== fs.readFileSync(filename + ".sha256", "utf8").trim()) throw new Error("response_changed");
    const receipt = readJson(filename);
    if (receipt.outcome !== "ready") return { ...job, outcome: receipt.outcome, usage: receipt.usage, elapsedMs: receipt.elapsedMs, responseHash };
    const result = parseDictionaryMeaningTranslationResult(receipt.rawContent, snapshot.item.request);
    return { ...job, outcome: "ready", evaluation: evaluateAlternatives(snapshot.item, result),
      result, usage: receipt.usage, elapsedMs: receipt.elapsedMs, responseHash: hash(fs.readFileSync(filename, "utf8")) };
  });
  const ready = rows.filter(row => row.outcome === "ready");
  const times = ready.map(row => row.elapsedMs ?? 0).sort((a, b) => a - b);
  return { schemaVersion: "translation-eval-assessment-v1", runId: manifest.runId,
    manifestHash: hash(fs.readFileSync(path.join(run, "manifest.json"), "utf8")),
    evaluatorHash: manifest.sourceHashes["apps/ui/scripts/translation-eval/evaluate.ts"],
    currentEvaluatorHash: hash(fs.readFileSync(path.resolve(process.cwd(), "scripts/translation-eval/evaluate.ts"), "utf8")),
    reviewStatus: "automatic-checks-only", humanApproved: false, rows,
    summary: { planned: rows.length, ready: ready.length,
      hardFailures: rows.filter(row => row.outcome !== "ready" || !row.evaluation?.hasPrimary || row.evaluation?.excessive || row.evaluation?.controlViolation || row.evaluation?.baseUnexpected || row.evaluation?.unexpected.length).length,
      withUsefulAlternatives: ready.filter(row => row.evaluation?.usefulAlternativesPresent).length,
      inputTokensKnown: rows.reduce((n, row) => n + (row.usage?.prompt_tokens ?? 0), 0),
      outputTokensKnown: rows.reduce((n, row) => n + (row.usage?.completion_tokens ?? 0), 0),
      missingUsage: rows.filter(row => row.outcome !== "missing" && !row.usage).length,
      medianLatencyMs: times.length ? times[Math.floor(times.length / 2)] : null,
      maximumLatencyMs: times.length ? times[times.length - 1] : null,
      monetaryCost: null },
  };
}
