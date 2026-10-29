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
  assert.match(workflow, /EXTERNAL_FREIGHT_SOURCE_MODE=incoming/);
  assert.match(workflow, /if sudo -n grep -q '\^EXTERNAL_FREIGHT_SOURCE_MODE='/);
  assert.match(workflow, /previous\.env/);
  assert.match(workflow, /EXTERNAL_FREIGHT_IMPORTER_KEY/);
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

test('workflow restarts the stuck Telegram publisher and verifies whether queue advances', () => {
  assert.match(workflow, /systemctl restart urtruck-telegram-feed\.service/);
  assert.match(workflow, /systemctl is-active urtruck-telegram-feed\.service/);
  assert.match(workflow, /app_messages_last_10m/);
  assert.match(workflow, /latest_message_seconds_ago/);
  assert.match(workflow, /queue_by_status/);
  assert.match(workflow, /sending_age_seconds/);
  assert.match(workflow, /telegram_publish_interval_seconds/);
  assert.match(workflow, /delivery_requires_review\|delivery_reconciled/);
  assert.match(workflow, /sleep 65/);
  assert.match(workflow, /previous-feed\.py/);
  assert.match(workflow, /QA2_TELEGRAM_FEED_SHA256/);
  assert.match(workflow, /delivery_retry_recovered/);
});
