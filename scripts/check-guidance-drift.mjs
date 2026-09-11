import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RETIRED_RUNTIME_NAMES = ["handle_review", "handle_click", "get_next_word"];

const root = fileURLToPath(new URL("../", import.meta.url));
const textExtensions = new Set([".md", ".mdc", ".txt"]);
const excludedDirectories = new Set([".git", "node_modules", "reports", "tmp", "archive"]);

function isTextFile(path) {
  return textExtensions.has(extname(path));
}

function walk(directory, files) {
  if (!existsSync(directory)) return;
  const statEntries = readdirSync(directory, { withFileTypes: true });
  for (const entry of statEntries) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else if (isTextFile(path)) files.add(path);
  }
}

function addPath(repoRoot, relativePath, files) {
  const path = resolve(repoRoot, relativePath);
  if (!existsSync(path)) return;
  if (statSync(path).isDirectory()) {
    walk(path, files);
    return;
  }
  if (isTextFile(path)) files.add(path);
}

function addAgentGuidance(repoRoot, files) {
  function visit(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name === "AGENTS.md") files.add(path);
    }
  }
  visit(repoRoot);
}

export function activeGuidanceFiles(repoRoot = root) {
  const files = new Set();
  addAgentGuidance(repoRoot, files);

  for (const path of [
    ".cursor",
    "README.md",
    "db",
    "packages/docs",
    "docs/reference/api-functions",
    "docs/exec-plans/active",
  ]) {
    addPath(repoRoot, path, files);
  }

  return [...files].sort();
}

export function findGuidanceDrift(repoRoot = root) {
  const findings = [];
  for (const path of activeGuidanceFiles(repoRoot)) {
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const name of RETIRED_RUNTIME_NAMES) {
        if (new RegExp(`\\b${name}\\b`).test(line)) {
          findings.push({
            path: relative(repoRoot, path),
            line: index + 1,
            name,
          });
        }
      }
    });
  }
  return findings;
}

function main() {
  const findings = findGuidanceDrift(root);
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.path}:${finding.line}: retired runtime name ${finding.name}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Active guidance drift check passed (${activeGuidanceFiles(root).length} files).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
