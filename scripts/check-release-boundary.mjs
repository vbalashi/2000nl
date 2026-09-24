import { readFile } from 'node:fs/promises';
import { affectedMainPulls, checkReleaseBoundary, triggersDeploy } from './lib/release-boundary.mjs';

const repository = process.env.GITHUB_REPOSITORY;
const eventPath = process.env.GITHUB_EVENT_PATH;
const token = process.env.GITHUB_TOKEN;

if (!repository || !eventPath || !token) {
  throw new Error('GITHUB_REPOSITORY, GITHUB_EVENT_PATH, and GITHUB_TOKEN are required');
}

const event = JSON.parse(await readFile(eventPath, 'utf8'));
const pull = event.pull_request;
if (!pull || pull.base.repo?.full_name !== repository) {
  throw new Error('Expected a pull request targeting this repository');
}

async function listPages(path) {
  const items = [];
  for (let page = 1; page <= 30; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}${separator}per_page=100&page=${page}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`GitHub API ${path} failed: HTTP ${response.status}`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error(`GitHub API ${path} did not return a list`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  throw new Error(`GitHub API ${path} exceeded pagination limit; refusing to guess release safety`);
}

const openPulls = await listPages('pulls?state=open');
for (const target of affectedMainPulls(event, openPulls, repository)) {
  const changedFiles = (await listPages(`pulls/${target.number}/files`))
    .flatMap((file) => [file.filename, file.previous_filename].filter(Boolean));
  const result = checkReleaseBoundary({ pull: target, changedFiles, openPulls, repository });
  const state = result.errors.length > 0 ? 'failure' : 'success';
  const statusResponse = await fetch(`https://api.github.com/repos/${repository}/statuses/${target.head.sha}`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      state,
      context: 'release-boundary',
      description: state === 'success' ? 'Safe release boundary confirmed' : 'Incomplete release boundary; inspect workflow',
      target_url: process.env.GITHUB_RUN_ID ? `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined,
    }),
  });
  if (!statusResponse.ok) throw new Error(`GitHub status update failed for #${target.number}: HTTP ${statusResponse.status}`);

  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`::error title=PR #${target.number}::${error}`);
    process.exitCode = 1;
  } else {
    console.log(`PR #${target.number}: ${result.deployRelevant ? 'independent release boundary confirmed' : 'no test-production deployment triggered'}.`);
  }
}
