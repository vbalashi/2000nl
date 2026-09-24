import { readFile } from 'node:fs/promises';
import { checkReleaseBoundary, triggersDeploy } from './lib/release-boundary.mjs';

const repository = process.env.GITHUB_REPOSITORY;
const eventPath = process.env.GITHUB_EVENT_PATH;
const token = process.env.GITHUB_TOKEN;

if (!repository || !eventPath || !token) {
  throw new Error('GITHUB_REPOSITORY, GITHUB_EVENT_PATH, and GITHUB_TOKEN are required');
}

const event = JSON.parse(await readFile(eventPath, 'utf8'));
const pull = event.pull_request;
if (!pull || pull.base.ref !== 'main' || pull.base.repo?.full_name !== repository) {
  throw new Error('Expected a pull request targeting this repository main branch');
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

const changedFiles = (await listPages(`pulls/${pull.number}/files`)).map((file) => file.filename);
const openPulls = changedFiles.some(triggersDeploy)
  ? await listPages('pulls?state=open')
  : [];
const result = checkReleaseBoundary({ pull, changedFiles, openPulls, repository });

if (result.errors.length > 0) {
  for (const error of result.errors) console.error(`::error::${error}`);
  process.exitCode = 1;
} else {
  console.log(result.deployRelevant ? 'Deploy-relevant PR has an independent release boundary.' : 'No test-production deployment is triggered by this PR.');
}
