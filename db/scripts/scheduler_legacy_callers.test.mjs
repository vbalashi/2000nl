import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");

// The old scheduler entry points remain in historical migrations and in the
// local contract probe as explicit absence assertions. Neither is a runtime
// caller. Everything else under the application, package, and operational
// script trees must use the explicit practice-aware signatures.
const allowedLegacyReferences = new Set([
  "apps/ui/tests/fsrs/platformKnownMarkRpc.test.ts",
]);
const forbiddenPatterns = [
  /get_next_card_without_known/,
  /get_next_filtered_card_without_known/,
  /public\.get_next_card\(uuid,text\[\],uuid\[\],uuid,text,text,text,text\[\]\)/,
  /public\.get_next_filtered_card\(uuid,text\[\],uuid\[\],uuid,text,text,text,text\[\],jsonb\)/,
];

function oldGenericSchedulerCall(source, functionName, argumentCount) {
  const executableSource = source
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const call = new RegExp(`\\b${functionName}\\s*\\(`, "g");
  const violations = [];
  for (const match of executableSource.matchAll(call)) {
    let depth = 1;
    let inSingleQuote = false;
    let escaped = false;
    let commas = 0;
    let end = match.index + match[0].length;
    for (; end < executableSource.length && depth > 0; end += 1) {
      const character = executableSource[end];
      if (inSingleQuote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === "'") inSingleQuote = false;
        continue;
      }
      if (character === "'") inSingleQuote = true;
      else if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
      else if (character === "," && depth === 1) commas += 1;
    }
    if (depth === 0 && commas + 1 === argumentCount) violations.push(match.index);
  }
  return violations;
}

test("no active scheduler caller uses retired compatibility entry points", () => {
  const trackedFiles = execFileSync(
    "git",
    ["ls-files", "apps", "packages", "db/scripts", "scripts"],
    { cwd: repoRoot, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .filter((relativePath) => !relativePath.startsWith("db/migrations/"))
    .filter((relativePath) => !relativePath.startsWith("db/deploy-contract/"))
    .filter((relativePath) => relativePath !== "db/scripts/local_supabase_probe.sql")
    .filter((relativePath) => relativePath !== "db/scripts/scheduler_legacy_callers.test.mjs")
    .filter((relativePath) => fs.existsSync(path.join(repoRoot, relativePath)))
    .filter((relativePath) => fs.statSync(path.join(repoRoot, relativePath)).isFile())
    .filter((relativePath) => !allowedLegacyReferences.has(relativePath));

  const violations = [];
  for (const relativePath of trackedFiles) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath}: ${pattern}`);
      }
    }
    for (const [functionName, argumentCount] of [
      ["get_next_card", 8],
      ["get_next_filtered_card", 9],
    ]) {
      for (const offset of oldGenericSchedulerCall(source, functionName, argumentCount)) {
        violations.push(
          `${relativePath}:${offset}: ${functionName} uses retired ${argumentCount}-argument signature`,
        );
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    "retired scheduler compatibility references must remain confined to historical/contract assertions",
  );
});
