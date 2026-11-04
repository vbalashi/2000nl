import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(resolve(root, path));

test('fresh-install migrations and contract checksums describe the same database', () => {
  const contract = JSON.parse(read('packages/shared/deployment/db-contract.json').toString());
  const files = [contract.baseline, ...contract.migrations];
  const bootstrap = read('db/migrations/bootstrap.sql').toString();
  const references = [...bootstrap.matchAll(/^\\i (db\/migrations\/\S+)$/gm)].map(match => match[1]);
  expect(references).toEqual(files.map(item => item.file));
  for (const item of [...files, contract.readOnlyPostflightProbe]) {
    expect(createHash('sha256').update(read(item.file)).digest('hex')).toBe(item.sha256);
  }
  expect(contract.contractId).toBe(`2000nl-db-${files.at(-1).migrationId}`);
  expect(read(contract.postflightProbe).toString()).toContain('exercise-studying-filter-probe.sql');
  expect(read(contract.readOnlyPostflightProbe.file).toString()).toContain('exercise-studying-filter-probe.sql');
});
