import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import yaml from 'yaml';
const workflow = yaml.parse(readFileSync(new URL('../../.github/workflows/deploy-play.yml', import.meta.url), 'utf8'));
test('магазинная сборка получает явный флаг ленты без нового трека или обхода CI', () => {
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.enable_external_freight_feed, {
    description: 'Включить принятую внешнюю ленту в магазинной сборке', required: false, default: true, type: 'boolean',
  });
  const job=workflow.jobs['build-and-submit'];
  assert.equal(job.needs,'quality-gate');
  assert.equal(job.env.EXPO_PUBLIC_EXTERNAL_FREIGHT_FEED_ENABLED, "${{ (github.event_name == 'push' || inputs.enable_external_freight_feed) && 'true' || 'false' }}");
  const guard = job.steps.find(step => step.name === 'Запретить магазинную сборку без внешней ленты');
  assert.ok(guard && guard.run.includes('test "$EXPO_PUBLIC_EXTERNAL_FREIGHT_FEED_ENABLED" = true'));
  assert.ok(job.steps.indexOf(guard) < job.steps.findIndex(step => step.name === 'Build release AAB'));
  assert.ok(job.steps.find(step => step.name === 'Verify built AAB identity and versionCode').run.includes('node scripts/require-feed-config.mjs'));
  assert.ok(job.steps.find(step => step.name === 'Verify signed production APK identity and host').run.includes('node scripts/require-feed-config.mjs'));
  assert.ok(job.steps.find(step=>step.name==='Build release AAB'));
  assert.equal(workflow.on.workflow_dispatch.inputs.track.default,'internal');
  assert.equal(workflow.on.workflow_dispatch.inputs.status.default,'draft');
});

test('Фактический артефакт с false или отсутствующим флагом отклоняется', () => {
  const dir = mkdtempSync(join(tmpdir(), 'urtruck-store-feed-'));
  try {
    const file = join(dir, 'app.config');
    for (const [value, expected] of [[true, 0], [false, 1], ['true', 1], [null, 1]]) {
      writeFileSync(file, JSON.stringify({ extra: { urtruckExternalFreightFeedEnabled: value } }));
      assert.equal(spawnSync('node', ['scripts/require-feed-config.mjs', file]).status, expected);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
