import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UPSTREAM_COMMIT,
  evaluateUpstreamStatus,
  isNewerVersion,
} from '../../scripts/security-check-braces-upstream.mjs';

const openPullRequest = {
  merged_at: null,
  head: {sha: UPSTREAM_COMMIT},
};

test('monitor accepts the current upstream state while no fixed release exists', () => {
  assert.deepEqual(evaluateUpstreamStatus({
    latestVersion: '3.0.3',
    pullRequest: openPullRequest,
  }), {
    officialReleaseAvailable: false,
    upstreamMerged: false,
    removalRequired: false,
  });
});

test('monitor requires removal after a published fixed release or merge', () => {
  assert.equal(isNewerVersion('3.0.4', '3.0.3'), true);
  assert.equal(evaluateUpstreamStatus({
    latestVersion: '3.0.4',
    pullRequest: openPullRequest,
  }).removalRequired, true);
  assert.equal(evaluateUpstreamStatus({
    latestVersion: '3.0.3',
    pullRequest: {...openPullRequest, merged_at: '2026-10-03T00:00:00Z'},
  }).removalRequired, true);
});

test('monitor refuses an unreviewed upstream PR head', () => {
  assert.throws(() => evaluateUpstreamStatus({
    latestVersion: '3.0.3',
    pullRequest: {...openPullRequest, head: {sha: 'unreviewed'}},
  }), /head changed/);
});
