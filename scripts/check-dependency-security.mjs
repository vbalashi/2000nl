import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function checkAudit(audit) {
  if (audit?.error || audit?.auditReportVersion !== 2 || !audit.vulnerabilities || !audit.metadata?.vulnerabilities) {
    throw new Error('Missing or invalid npm audit report; refusing to pass without registry evidence.');
  }
  const findings = Object.values(audit.vulnerabilities);
  for (const level of ['info', 'low', 'moderate', 'high', 'critical']) {
    const count = audit.metadata.vulnerabilities[level];
    if (!Number.isInteger(count) || count < 0 || count !== findings.filter(v => v?.severity === level).length) {
      throw new Error('Inconsistent npm audit severity counters.');
    }
  }
  if (findings.some(v => !['info', 'low', 'moderate', 'high', 'critical'].includes(v?.severity))) {
    throw new Error('Invalid npm audit finding severity.');
  }
  return Object.entries(audit.vulnerabilities)
    .filter(([, finding]) => ['high', 'critical'].includes(finding.severity))
    .map(([name, finding]) => `${name}: ${finding.severity}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
      cwd: fileURLToPath(new URL('../apps/ui/', import.meta.url)),
      encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
    });
    if (result.error || ![0, 1].includes(result.status)) throw result.error ?? new Error(`npm audit failed (${result.status}): ${result.stderr}`);
    const audit = JSON.parse(result.stdout);
    const blocked = checkAudit(audit);
    console.log(JSON.stringify(audit.metadata.vulnerabilities));
    for (const [name, finding] of Object.entries(audit.vulnerabilities)) {
      console.log(`${name}: ${finding.severity}`);
      for (const advisory of finding.via) if (typeof advisory === 'object') console.log(`  ${advisory.url} ${advisory.title}`);
    }
    if (blocked.length) throw new Error(`Production high/critical vulnerabilities block this check: ${blocked.join(', ')}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
