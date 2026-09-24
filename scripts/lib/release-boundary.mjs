const deployPrefixes = [
  'apps/',
  'packages/shared/',
  'db/migrations/',
  'db/deploy-contract/',
  'supabase/',
];

const deployFiles = new Set([
  'db/scripts/deploy_db_contract.mjs',
  'db/scripts/postgres_client.mjs',
  'scripts/verify-deploy-health.mjs',
  '.dockerignore',
  'docker-compose.yml',
  '.github/workflows/deploy-nuc.yml',
]);

export function triggersDeploy(path) {
  if (path.endsWith('.md') || path.startsWith('apps/') && path.split('/').slice(1).includes('docs')) {
    return false;
  }
  return deployFiles.has(path) || deployPrefixes.some((prefix) => path.startsWith(prefix));
}

export function hasReleaseReadyDeclaration(body) {
  return /^Release-Ready:\s*yes\s*$/im.test(body || '');
}

export function openChildPulls(parent, openPulls, repository) {
  if (parent.head.repo?.full_name !== repository) return [];
  return openPulls.filter((candidate) =>
    candidate.number !== parent.number &&
    candidate.base.repo?.full_name === repository &&
    candidate.base.ref === parent.head.ref
  );
}

export function checkReleaseBoundary({ pull, changedFiles, openPulls, repository }) {
  if (!changedFiles.some(triggersDeploy)) {
    return { deployRelevant: false, errors: [] };
  }

  const errors = [];
  if (!hasReleaseReadyDeclaration(pull.body)) {
    errors.push('Add `Release-Ready: yes` to the PR body after confirming this PR can be deployed by itself. If it cannot, combine the dependent changes in one integration PR.');
  }

  const children = openChildPulls(pull, openPulls, repository);
  if (children.length > 0) {
    errors.push(`Open PRs target this branch: ${children.map((child) => `#${child.number}`).join(', ')}. Merge the complete change as one integration PR, or retarget and verify the children before merging this PR.`);
  }

  return { deployRelevant: true, errors };
}
