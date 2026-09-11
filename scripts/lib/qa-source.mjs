import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FULL_SHA = /^[0-9a-f]{40}$/i;

export class QaSourceError extends Error {}

function runGit(repoRoot, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    if (allowFailure) return "";
    const detail = String(result.stderr || "").trim();
    throw new QaSourceError(
      `Git command failed (${args.join(" ")})${detail ? `: ${detail}` : ""}`,
    );
  }
  return String(result.stdout || "").trim();
}

function branchName(repoRoot) {
  return (
    runGit(repoRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"], {
      allowFailure: true,
    }) || null
  );
}

function upstreamName(repoRoot) {
  return (
    runGit(repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {
      allowFailure: true,
    }) || null
  );
}

function aheadBehind(repoRoot, upstream) {
  if (!upstream) return { ahead: null, behind: null };
  const output = runGit(repoRoot, ["rev-list", "--left-right", "--count", `HEAD...${upstream}`]);
  const [ahead, behind] = output.split(/\s+/).map((value) => Number.parseInt(value, 10));
  return {
    ahead: Number.isSafeInteger(ahead) ? ahead : null,
    behind: Number.isSafeInteger(behind) ? behind : null,
  };
}

function remoteRefsContainingHead(repoRoot) {
  return runGit(repoRoot, ["for-each-ref", "--format=%(refname)", "--contains", "HEAD", "refs/remotes"])
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function cherryStatuses(repoRoot, originMain) {
  if (!originMain) return [];
  return runGit(repoRoot, ["cherry", originMain, "HEAD"], { allowFailure: true })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line[0]);
}

function squashMergedState(repoRoot, head, originMain, branch) {
  if (!branch || !originMain || head === originMain) return false;
  const statuses = cherryStatuses(repoRoot, originMain);
  if (statuses.length === 0) return false;
  return statuses.every((status) => status === "-");
}

function validateRepoRoot(repoRoot) {
  const requested = fs.realpathSync(path.resolve(repoRoot));
  if (!fs.existsSync(requested)) {
    throw new QaSourceError(`Repository path does not exist: ${requested}`);
  }
  const actual = fs.realpathSync(path.resolve(runGit(requested, ["rev-parse", "--show-toplevel"])));
  if (actual !== requested) {
    throw new QaSourceError(`Repository root mismatch: expected ${requested}, got ${actual}`);
  }
  return requested;
}

function fail(message) {
  throw new QaSourceError(message);
}

export function inspectQaSource({
  repoRoot,
  mode = "canonical",
  workRef = "",
  expectedCommit = "",
  fetchCanonical = true,
} = {}) {
  const root = validateRepoRoot(repoRoot);
  if (!['canonical', 'preview'].includes(mode)) {
    fail(`Unknown QA source mode: ${mode}`);
  }

  const head = runGit(root, ["rev-parse", "HEAD"]).toLowerCase();
  const branch = branchName(root);
  const dirty = Boolean(runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]));

  if (mode === "canonical") {
    if (workRef || expectedCommit) {
      fail("Canonical QA must not receive preview work-ref or expected commit arguments.");
    }
    if (branch !== "main") {
      fail(`Canonical QA requires branch main; current checkout is ${branch ?? "detached"}.`);
    }
    if (dirty) {
      fail("Canonical QA requires a clean checkout; use explicit preview arguments for work-in-progress.");
    }
    if (fetchCanonical) runGit(root, ["fetch", "--no-tags", "origin", "main"]);
  } else {
    if (!workRef || !String(workRef).trim()) {
      fail("Preview QA requires --work-ref.");
    }
    if (!FULL_SHA.test(expectedCommit)) {
      fail("Preview QA requires --expected-commit with an exact 40-character SHA.");
    }
    const expected = expectedCommit.toLowerCase();
    runGit(root, ["cat-file", "-e", `${expected}^{commit}`]);
    if (head !== expected) {
      fail(`Preview commit mismatch: expected ${expected}, current checkout is ${head}.`);
    }
  }

  const originMain = runGit(root, ["rev-parse", "refs/remotes/origin/main"], {
    allowFailure: true,
  }).toLowerCase() || null;
  if (mode === "canonical" && head !== originMain) {
    fail(`Canonical checkout is stale: HEAD ${head} does not match origin/main ${originMain ?? "missing"}.`);
  }

  const upstream = upstreamName(root);
  const { ahead, behind } = aheadBehind(root, upstream);
  const remoteRefs = remoteRefsContainingHead(root);

  return {
    mode,
    workRef: mode === "canonical" ? "canonical-main" : String(workRef).trim(),
    checkoutPath: root,
    commit: head,
    branch,
    dirty,
    upstream,
    ahead,
    behind,
    originMain,
    remoteRefsContainingHead: remoteRefs,
    squashMerged: squashMergedState(root, head, originMain, branch),
  };
}

export function sourceEnvironment(source) {
  return {
    QA_SOURCE_MODE: source.mode,
    QA_SOURCE_WORK_REF: source.workRef,
    QA_SOURCE_CHECKOUT_PATH: source.checkoutPath,
    QA_SOURCE_COMMIT: source.commit,
    QA_SOURCE_BRANCH: source.branch ?? "",
    QA_SOURCE_DIRTY: String(source.dirty),
    QA_SOURCE_UPSTREAM: source.upstream ?? "",
    QA_SOURCE_AHEAD: source.ahead == null ? "" : String(source.ahead),
    QA_SOURCE_BEHIND: source.behind == null ? "" : String(source.behind),
    QA_SOURCE_ORIGIN_MAIN: source.originMain ?? "",
    QA_SOURCE_REMOTE_REFS: source.remoteRefsContainingHead.join(","),
    QA_SOURCE_SQUASH_MERGED: String(source.squashMerged),
  };
}
