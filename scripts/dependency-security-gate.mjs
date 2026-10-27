import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const severityRank = {info: 0, low: 1, moderate: 2, high: 3, critical: 4};

export function evaluateAudit(audit) {
  const vulnerabilities = audit?.vulnerabilities;
  assert.ok(vulnerabilities && typeof vulnerabilities === 'object',
    'npm audit did not return a vulnerabilities object');
  return Object.entries(vulnerabilities)
    .filter(([, vulnerability]) =>
      (severityRank[vulnerability.severity] ?? Infinity) >= severityRank.moderate)
    .map(([name, vulnerability]) => ({
      name,
      severity: vulnerability.severity,
      via: vulnerability.via,
    }));
}

function runAudit(label, args) {
  const result = spawnSync('npm', args, {encoding: 'utf8'});
  if(result.error) {
    throw result.error;
  }
  const reportDir = process.env.SECURITY_AUDIT_REPORT_DIR ||
    'qa-artifacts/security-audit';
  mkdirSync(reportDir, {recursive: true});
  writeFileSync(
    `${reportDir}/${label.replaceAll(/[^a-z0-9]+/gi, '-')}.json`,
    result.stdout
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  assert.ok(result.status === 0 || result.status === 1,
    `npm ${args.join(' ')} failed with exit ${result.status}`);
  return JSON.parse(result.stdout);
}

function main() {
  const audits = [
    ['production', ['audit', '--omit=dev', '--json']],
    ['complete-dependency-tree', ['audit', '--json']],
  ];
  const blocked = [];
  for(const [label, args] of audits) {
    console.log(`\n--- raw npm audit: ${label} ---`);
    const audit = runAudit(label, args);
    blocked.push(...evaluateAudit(audit).map(item => ({...item, audit: label})));
  }

  const regression = spawnSync(
    process.execPath,
    ['--test', 'tests/security/node_forge_cve_2026_85393.test.mjs'],
    {encoding: 'utf8'}
  );
  process.stdout.write(regression.stdout);
  process.stderr.write(regression.stderr);
  assert.equal(regression.status, 0,
    'CVE-2026-85393 exploit regression must pass with the fixed upstream dependency.');
  assert.deepEqual(blocked, [],
    `Blocking npm audit findings: ${JSON.stringify(blocked)}`);
  console.log('Dependency audits are clean; the node-forge exploit regression passes.');
}

if(process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
