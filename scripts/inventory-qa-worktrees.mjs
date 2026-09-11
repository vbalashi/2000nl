#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const parsed = {
    repoRoot: path.resolve(import.meta.dirname, ".."),
    output: "",
  };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${key}`);
    if (key === "--repo-root") parsed.repoRoot = path.resolve(value);
    else if (key === "--output") parsed.output = path.resolve(value);
    else throw new Error(`Unknown argument: ${key}`);
  }
  if (!parsed.output) throw new Error("--output is required");
  return parsed;
}

function git(repoRoot, args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (allowFailure) return "";
    const detail = error?.stderr?.toString?.().trim();
    throw new Error(`Git command failed (${args.join(" ")})${detail ? `: ${detail}` : ""}`);
  }
}

function parseWorktrees(output) {
  const items = [];
  let item = null;
  for (const line of output.split("\n")) {
    if (!line) {
      if (item) items.push(item);
      item = null;
      continue;
    }
    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ");
    if (key === "worktree") item = { path: value };
    else if (item && key === "HEAD") item.head = value;
    else if (item && key === "branch") item.branch = value;
    else if (item && key === "detached") item.detached = true;
  }
  if (item) items.push(item);
  return items;
}

function branchName(item) {
  return item.branch?.replace(/^refs\/heads\//, "") ?? null;
}

function status(item) {
  return git(item.path, ["status", "--porcelain=v1", "--untracked-files=all"], {
    allowFailure: true,
  });
}

function isAncestor(repoRoot, ancestor, descendant) {
  if (!ancestor || !descendant) return false;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function sourceData(item, originMain) {
  const dirtyOutput = status(item);
  const dirty = Boolean(dirtyOutput);
  const upstream = git(item.path, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {
    allowFailure: true,
  }) || null;
  const counts = upstream
    ? git(item.path, ["rev-list", "--left-right", "--count", `HEAD...${upstream}`], { allowFailure: true })
        .split(/\s+/)
        .map((value) => Number.parseInt(value, 10))
    : [];
  const ahead = Number.isSafeInteger(counts[0]) ? counts[0] : null;
  const behind = Number.isSafeInteger(counts[1]) ? counts[1] : null;
  const remoteRefs = git(item.path, ["for-each-ref", "--format=%(refname)", "--contains", "HEAD", "refs/remotes"], {
    allowFailure: true,
  })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const integrated = isAncestor(item.path, "HEAD", originMain);
  const cherry = originMain
    ? git(item.path, ["cherry", originMain, "HEAD"], { allowFailure: true })
        .split("\n")
        .map((line) => line.trim()[0])
        .filter(Boolean)
    : [];
  const squashMerged = Boolean(branchName(item) && originMain && item.head !== originMain && cherry.length > 0 && cherry.every((mark) => mark === "-"));
  const detached = !branchName(item);
  const stale = branchName(item) === "main" && Boolean(originMain) && item.head !== originMain;
  const unpushed = upstream
    ? (ahead ?? 0) > 0
    : branchName(item)
      ? !remoteRefs.includes(`refs/remotes/origin/${branchName(item)}`)
      : remoteRefs.length === 0;
  const protectedWorktree = [
    "2000nl-issue-137-mobile-bottom-nav",
    "2000nl-issue-194-training-visuals",
  ].some((name) => item.path.endsWith(`/${name}`));
  const classification = [];
  if (dirty) classification.push("dirty");
  if (detached) classification.push("detached");
  if (unpushed) classification.push("unpushed");
  if (squashMerged) classification.push("squash-merged");
  if (stale) classification.push("stale");
  if (integrated) classification.push("integrated");
  if (classification.length === 0) classification.push("active");
  return {
    path: item.path,
    head: item.head,
    branch: branchName(item),
    dirty,
    dirtyPathCount: dirtyOutput ? dirtyOutput.split("\n").length : 0,
    detached,
    upstream,
    ahead,
    behind,
    aheadBehind: ahead == null || behind == null ? null : `${ahead}\t${behind}`,
    unpushed,
    stale,
    squashMerged,
    integrated,
    remoteRefsContainingHead: remoteRefs,
    classification,
    protected: protectedWorktree,
    preserveReason: protectedWorktree ? "Owner-preserved visual evidence; never delete automatically." : null,
  };
}

try {
  const options = parseArgs(process.argv.slice(2));
  const originMain = git(options.repoRoot, ["rev-parse", "refs/remotes/origin/main"], {
    allowFailure: true,
  });
  const items = parseWorktrees(git(options.repoRoot, ["worktree", "list", "--porcelain"]))
    .map((item) => sourceData(item, originMain));
  const document = {
    schemaVersion: 2,
    checkedAt: new Date().toISOString(),
    baseline: originMain || null,
    policy: {
      noAutomaticDeletion: true,
      dirtyIgnoredFilesAreNotRemoved: true,
      squashMergedRequiresReview: true,
      protectedReferences: ["#144"],
      protectedWorktrees: ["2000nl-issue-137-mobile-bottom-nav", "2000nl-issue-194-training-visuals"],
    },
    items,
  };
  writeFileSync(options.output, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o644 });
  process.stdout.write(`inventoried ${items.length} worktrees at ${options.output}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
