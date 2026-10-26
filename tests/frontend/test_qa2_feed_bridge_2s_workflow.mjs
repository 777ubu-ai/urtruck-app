import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/qa2-feed-bridge-2s.yml', 'utf8');
const timer = readFileSync('docs/qa/external-freight-feed-20261020/urtruck-qa2-feed-bridge.timer', 'utf8');

test('QA2 bridge timer is set to two seconds and stays isolated', () => {
  assert.match(timer, /^OnUnitInactiveSec=2$/m);
  assert.match(workflow, /branches: \[qa2\/integration-candidate\]/);
  assert.match(workflow, /environment:\n\s+name: qa2/);
  assert.match(workflow, /test "\$GITHUB_REF_NAME" = "qa2\/integration-candidate"/);
  assert.match(workflow, /test "\$QA_SOURCE_SHA" = "\$GITHUB_SHA"/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /systemd-analyze verify/);
  assert.match(workflow, /OnUnitInactiveSec=\n\s+OnUnitInactiveSec=2/);
  assert.match(workflow, /30-five-second-poll\.conf/);
  assert.match(workflow, /previous-30\.conf/);
  assert.match(workflow, /systemctl cat urtruck-qa2-feed-bridge\.timer --no-pager/);
  assert.match(workflow, /systemctl show urtruck-qa2-feed-bridge\.timer -p TimersMonotonic --no-pager/);
  assert.match(workflow, /OnUnitInactiveUSec=2s/);
  assert.match(workflow, /Verify Production fingerprint unchanged/);
  assert.match(workflow, /Restore prior QA2 timer if configuration failed/);
  assert.match(workflow, /PREVIOUS_LEGACY_DROPIN/);
  assert.match(workflow, /systemctl restart urtruck-qa2-feed-bridge.timer/);
  assert.match(workflow, /journalctl -u urtruck-qa2-feed-bridge\.service/);
  assert.doesNotMatch(workflow, /urtruck\.kz\/api\/version[^\n]*POST/);
});
