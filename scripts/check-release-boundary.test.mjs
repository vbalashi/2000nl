import assert from 'node:assert/strict';
import test from 'node:test';
import { checkReleaseBoundary, hasReleaseReadyDeclaration, triggersDeploy } from './lib/release-boundary.mjs';

const repo = 'vbalashi/2000nl';
const pull = {
  number: 1,
  body: 'Release-Ready: yes',
  head: { ref: 'feature', repo: { full_name: repo } },
};

test('matches deploy workflow paths and excludes documentation', () => {
  for (const path of ['apps/ui/app/page.tsx', 'packages/shared/src/card.ts', 'db/migrations/001.sql', 'db/deploy-contract/manifest.json', 'supabase/config.toml', 'docker-compose.yml', '.github/workflows/deploy-nuc.yml']) {
    assert.equal(triggersDeploy(path), true, path);
  }
  for (const path of ['docs/runbook.md', 'apps/ui/docs/notes.txt', 'apps/ui/README.md', 'packages/docs/schema.json', 'reports/result.json', 'scripts/check-release-boundary.mjs']) {
    assert.equal(triggersDeploy(path), false, path);
  }
});

test('requires an affirmative standalone release declaration', () => {
  assert.equal(hasReleaseReadyDeclaration('Release-Ready: yes'), true);
  assert.equal(hasReleaseReadyDeclaration('Release-Ready: no'), false);
  assert.equal(hasReleaseReadyDeclaration('Discussion: Release-Ready: yes'), false);
});

test('blocks a parent even when it claims to be ready', () => {
  const child = { number: 2, base: { ref: 'feature', repo: { full_name: repo } } };
  const result = checkReleaseBoundary({ pull, changedFiles: ['apps/ui/app/page.tsx'], openPulls: [child], repository: repo });
  assert.equal(result.deployRelevant, true);
  assert.match(result.errors.join(' '), /#2/);
});

test('allows an independent deploy-relevant PR', () => {
  const result = checkReleaseBoundary({ pull, changedFiles: ['apps/ui/app/page.tsx'], openPulls: [], repository: repo });
  assert.deepEqual(result.errors, []);
});

test('does not require a release declaration for docs-only changes', () => {
  const result = checkReleaseBoundary({ pull: { ...pull, body: '' }, changedFiles: ['docs/runbook.md'], openPulls: [], repository: repo });
  assert.equal(result.deployRelevant, false);
  assert.deepEqual(result.errors, []);
});
