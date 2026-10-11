import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
const script = path.resolve(import.meta.dirname, "start-translation-worker.mjs");
for (const enabled of [true, false]) test(`worker deployment enabled=${enabled} uses resolved config without printing secrets`, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "translation-compose-"));
  const log = path.join(directory, "calls.jsonl");
  try {
    await writeFile(path.join(directory, "docker"), `#!${process.execPath}\nimport fs from 'node:fs';\nfs.appendFileSync(process.env.TEST_CALLS,JSON.stringify(process.argv.slice(2))+'\\n');\nif(process.argv.includes('config'))console.log(JSON.stringify({services:{ui:{environment:{DICTIONARY_TRANSLATION_JOBS_ENABLED:process.env.TEST_ENABLED,SUPABASE_SECRET_KEY:'never-print-test-secret'}}}}));\n`, { mode: 0o755 });
    const result = spawnSync(process.execPath, [script], { encoding: "utf8", env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, TEST_CALLS: log, TEST_ENABLED: String(enabled) } });
    assert.equal(result.status, 0, result.stderr);
    const calls = (await readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
    assert.deepEqual(calls[0], ["compose", "config", "--format", "json"]);
    assert.equal(calls[1].includes(enabled ? "up" : "stop"), true);
    if (enabled) assert.equal(calls[1].includes("--wait"), true);
    assert.equal((result.stdout + result.stderr).includes("never-print-test-secret"), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
