import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceScript = fileURLToPath(new URL('./sync-reference.sh', import.meta.url));
const createWorktreeScript = fileURLToPath(new URL('./create-worktree.sh', import.meta.url));

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function createFixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), '2000nl-reference-sync-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = path.join(root, 'origin.git');
  const reference = path.join(root, 'reference');
  git(root, 'init', '--bare', '--initial-branch=main', origin);
  mkdirSync(path.join(reference, 'scripts'), { recursive: true });
  git(root, 'init', '--initial-branch=main', reference);
  git(reference, 'config', 'user.name', 'Reference Sync Test');
  git(reference, 'config', 'user.email', 'reference-sync@example.invalid');
  writeFileSync(path.join(reference, 'README.md'), 'fixture\n');
  copyFileSync(sourceScript, path.join(reference, 'scripts/sync-reference.sh'));
  copyFileSync(createWorktreeScript, path.join(reference, 'scripts/create-worktree.sh'));
  git(reference, 'add', 'README.md', 'scripts/sync-reference.sh', 'scripts/create-worktree.sh');
  git(reference, 'commit', '-m', 'initial reference');
  git(reference, 'remote', 'add', 'origin', origin);
  git(reference, 'push', '--set-upstream', 'origin', 'main');
  const writer = path.join(root, 'writer');
  git(root, 'clone', origin, writer);
  git(writer, 'config', 'user.name', 'Reference Sync Test');
  git(writer, 'config', 'user.email', 'reference-sync@example.invalid');
  return { root, origin, reference, writer };
}

function runSync(reference) {
  return spawnSync('bash', [path.join(reference, 'scripts/sync-reference.sh')], {
    cwd: reference,
    encoding: 'utf8',
  });
}

test('fast-forwards a clean canonical main checkout from origin/main', (t) => {
  const { reference, writer } = createFixture(t);
  writeFileSync(path.join(writer, 'release.txt'), 'released\n');
  git(writer, 'add', 'release.txt');
  git(writer, 'commit', '-m', 'release commit');
  git(writer, 'push', 'origin', 'main');
  const remoteHead = git(writer, 'rev-parse', 'HEAD');

  const result = runSync(reference);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(reference, 'rev-parse', 'HEAD'), remoteHead);
  assert.match(result.stdout, /Fast-forwarded reference main/);
});

test('reports an already-current canonical main checkout without creating a commit', (t) => {
  const { reference } = createFixture(t);
  const before = git(reference, 'rev-parse', 'HEAD');
  const result = runSync(reference);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(reference, 'rev-parse', 'HEAD'), before);
  assert.match(result.stdout, /Reference main is current/);
});

test('create-worktree syncs canonical main before basing the new checkout', (t) => {
  const { root, reference, writer } = createFixture(t);
  writeFileSync(path.join(writer, 'release.txt'), 'released\n');
  git(writer, 'add', 'release.txt');
  git(writer, 'commit', '-m', 'release commit');
  git(writer, 'push', 'origin', 'main');
  const remoteHead = git(writer, 'rev-parse', 'HEAD');

  const result = spawnSync('bash', [path.join(reference, 'scripts/create-worktree.sh'), '616', 'fixture', '--no-install'], {
    cwd: reference,
    encoding: 'utf8',
  });
  const target = path.join(reference, '.worktrees/616-fixture');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(reference, 'rev-parse', 'HEAD'), remoteHead);
  assert.equal(git(target, 'rev-parse', 'HEAD'), remoteHead);
  assert.match(result.stdout, /Fast-forwarded reference main/);
  assert.match(result.stdout, /Created .*\.worktrees\/616-fixture/);
  assert.equal(git(root, '-C', target, 'status', '--porcelain'), '');
});

test('refuses tracked and untracked local changes without modifying either', (t) => {
  const { reference } = createFixture(t);
  writeFileSync(path.join(reference, 'README.md'), 'local changes\n');
  writeFileSync(path.join(reference, 'keep.txt'), 'keep\n');
  const result = runSync(reference);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /local changes/);
  assert.equal(readFileSync(path.join(reference, 'README.md'), 'utf8'), 'local changes\n');
  assert.equal(readFileSync(path.join(reference, 'keep.txt'), 'utf8'), 'keep\n');
});

test('refuses to sync from a non-main branch', (t) => {
  const { reference } = createFixture(t);
  git(reference, 'switch', '-c', 'topic');
  const result = runSync(reference);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be on main/);
  assert.equal(git(reference, 'branch', '--show-current'), 'topic');
});

test('refuses to sync from a linked worktree even if it has the main branch checked out elsewhere', (t) => {
  const { root, reference } = createFixture(t);
  const linked = path.join(root, 'linked');
  git(reference, 'worktree', 'add', '--detach', linked, 'main');
  const result = runSync(linked);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /canonical reference checkout/);
  assert.equal(git(reference, 'rev-parse', 'HEAD'), git(linked, 'rev-parse', 'HEAD'));
});

test('refuses local commits ahead of origin/main', (t) => {
  const { reference } = createFixture(t);
  writeFileSync(path.join(reference, 'local.txt'), 'local\n');
  git(reference, 'add', 'local.txt');
  git(reference, 'commit', '-m', 'local-only commit');
  const localHead = git(reference, 'rev-parse', 'HEAD');
  const result = runSync(reference);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ahead of or diverged/);
  assert.equal(git(reference, 'rev-parse', 'HEAD'), localHead);
});

test('refuses diverged local and remote histories without resolving either side', (t) => {
  const { reference, writer } = createFixture(t);
  writeFileSync(path.join(reference, 'local.txt'), 'local\n');
  git(reference, 'add', 'local.txt');
  git(reference, 'commit', '-m', 'local-only commit');
  const localHead = git(reference, 'rev-parse', 'HEAD');
  writeFileSync(path.join(writer, 'remote.txt'), 'remote\n');
  git(writer, 'add', 'remote.txt');
  git(writer, 'commit', '-m', 'remote-only commit');
  git(writer, 'push', 'origin', 'main');

  const result = runSync(reference);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ahead of or diverged/);
  assert.equal(git(reference, 'rev-parse', 'HEAD'), localHead);
  assert.equal(git(reference, 'status', '--porcelain'), '');
});
