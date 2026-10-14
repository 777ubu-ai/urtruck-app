import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const UPSTREAM_PULL_URL =
  'https://api.github.com/repos/micromatch/braces/pulls/72';
export const UPSTREAM_COMMIT =
  '28d440b5dd449dbf1fe6f3506cf94ecca4d02660';
export const LAST_AFFECTED_VERSION = '3.0.3';

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  assert.ok(match, `Unexpected braces version: ${value}`);
  return match.slice(1).map(Number);
}

export function isNewerVersion(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (const [index, part] of leftParts.entries()) {
    if (part !== rightParts[index]) {
      return part > rightParts[index];
    }
  }
  return false;
}

export function evaluateUpstreamStatus({latestVersion, pullRequest}) {
  assert.equal(typeof latestVersion, 'string', 'npm did not return a braces version');
  assert.equal(pullRequest?.head?.sha, UPSTREAM_COMMIT,
    'Upstream PR #72 head changed; re-review its exact diff before replacing the vetted package.');

  const officialReleaseAvailable = isNewerVersion(latestVersion, LAST_AFFECTED_VERSION);
  const upstreamMerged = pullRequest.merged_at !== null;
  return {
    officialReleaseAvailable,
    upstreamMerged,
    removalRequired: officialReleaseAvailable || upstreamMerged,
  };
}

function getLatestVersion() {
  const result = spawnSync('npm', ['view', 'braces', 'version', '--json'], {encoding: 'utf8'});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `npm view braces failed with exit ${result.status}`);
  return JSON.parse(result.stdout);
}

async function getPullRequest() {
  const response = await fetch(UPSTREAM_PULL_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'urtruck-braces-security-monitor',
      ...(process.env.GH_TOKEN ? {Authorization: `Bearer ${process.env.GH_TOKEN}`} : {}),
    },
  });
  assert.equal(response.ok, true,
    `Cannot read upstream braces PR #72: HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const status = evaluateUpstreamStatus({
    latestVersion: getLatestVersion(),
    pullRequest: await getPullRequest(),
  });
  console.log(JSON.stringify(status));
  assert.equal(status.removalRequired, false,
    'Official braces remediation is available: remove vendor/braces-3.0.4-28d440b, update the lockfile, and retire the vetted package.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
