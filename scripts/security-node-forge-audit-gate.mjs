import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const ADVISORY_URL =
  'https://github.com/advisories/GHSA-86w9-cpqp-85rv';
export const PATCH_PATH = 'patches/node-forge+1.4.0.patch';
export const PATCH_SHA256 =
  'f3e83351dc92090ce21f339420699316bebc4d128ad3e5ff19d1f55988653c47';
export const PATCHED_VERSION = '1.4.0';
export const EXPIRES_AT = '2026-12-31T00:00:00.000Z';

const severityRank = {info: 0, low: 1, moderate: 2, high: 3, critical: 4};

function isExpectedAdvisory(via) {
  return typeof via === 'object' && via !== null &&
    via.name === 'node-forge' && via.url === ADVISORY_URL &&
    via.range === '<=1.4.0' && via.severity === 'high';
}

function isOnlyExpectedCause(name, vulnerabilities, seen = new Set()) {
  if(seen.has(name)) {
    return false;
  }
  const vulnerability = vulnerabilities[name];
  if(!vulnerability || !Array.isArray(vulnerability.via) ||
    vulnerability.via.length === 0) {
    return false;
  }
  const nextSeen = new Set(seen).add(name);
  return vulnerability.via.every(via => {
    if(isExpectedAdvisory(via)) {
      return name === 'node-forge';
    }
    return typeof via === 'string' &&
      isOnlyExpectedCause(via, vulnerabilities, nextSeen);
  });
}

export function evaluateAudit(audit) {
  const vulnerabilities = audit?.vulnerabilities;
  assert.ok(vulnerabilities && typeof vulnerabilities === 'object',
    'npm audit did not return a vulnerabilities object');

  const blocked = [];
  for(const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if((severityRank[vulnerability.severity] ?? Infinity) < severityRank.moderate) {
      continue;
    }
    if(!isOnlyExpectedCause(name, vulnerabilities)) {
      blocked.push({name, severity: vulnerability.severity, via: vulnerability.via});
    }
  }
  return blocked;
}

function readInstalledNodeForgeVersion() {
  const packageJson = JSON.parse(readFileSync(
    new URL('../node_modules/node-forge/package.json', import.meta.url)
  ));
  return packageJson.version;
}

function compareSemver(left, right) {
  const parse = value => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
    assert.ok(match, `Unexpected node-forge version from npm registry: ${value}`);
    return match.slice(1).map(Number);
  };
  const [leftMajor, leftMinor, leftPatch] = parse(left);
  const [rightMajor, rightMinor, rightPatch] = parse(right);
  return leftMajor - rightMajor || leftMinor - rightMinor || leftPatch - rightPatch;
}

function assertNoOfficialReplacementExists() {
  const result = spawnSync('npm', ['view', 'node-forge', 'version', '--json'], {
    encoding: 'utf8',
  });
  if(result.error) {
    throw result.error;
  }
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  assert.equal(result.status, 0,
    `Cannot determine whether an official node-forge fix exists (exit ${result.status}).`);
  const latest = JSON.parse(result.stdout);
  assert.ok(compareSemver(latest, PATCHED_VERSION) <= 0,
    `node-forge@${latest} is published; remove ${PATCH_PATH}, update the lockfile, and retire this exception.`);
}

function assertCompensationPreconditions() {
  const now = new Date();
  assert.ok(now < new Date(EXPIRES_AT),
    `GHSA exception expired at ${EXPIRES_AT}; remove the patch and update node-forge.`);
  assert.equal(readInstalledNodeForgeVersion(), PATCHED_VERSION,
    `Exception is valid only for node-forge@${PATCHED_VERSION}.`);
  const patchHash = createHash('sha256').update(readFileSync(PATCH_PATH)).digest('hex');
  assert.equal(patchHash, PATCH_SHA256,
    'node-forge patch hash differs from the reviewed upstream ceba344 patch.');
  assertNoOfficialReplacementExists();
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
  // npm audit exits 1 when it found advisories; JSON still must be evaluated.
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
    const found = evaluateAudit(audit);
    blocked.push(...found.map(item => ({...item, audit: label})));
  }

  assertCompensationPreconditions();
  const regression = spawnSync(
    process.execPath,
    ['--test', 'tests/security/node_forge_cve_2026_85393.test.mjs'],
    {encoding: 'utf8'}
  );
  process.stdout.write(regression.stdout);
  process.stderr.write(regression.stderr);
  assert.equal(regression.status, 0,
    'CVE-2026-85393 exploit regression must pass before compensation is accepted.');
  assert.deepEqual(blocked, [],
    `Blocking npm audit findings: ${JSON.stringify(blocked)}`);
  console.log(`Only ${ADVISORY_URL} for node-forge@${PATCHED_VERSION} was compensated by verified patch ${PATCH_SHA256}.`);
}

if(process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
