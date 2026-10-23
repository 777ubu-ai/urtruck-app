import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'yaml';
const workflow = yaml.parse(readFileSync(new URL('../../.github/workflows/deploy-play.yml', import.meta.url), 'utf8'));
test('магазинная сборка получает явный флаг ленты без нового трека или обхода CI', () => {
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.enable_external_freight_feed, {
    description: 'Включить принятую внешнюю ленту в магазинной сборке', required: false, default: false, type: 'boolean',
  });
  const job=workflow.jobs['build-and-submit'];
  assert.equal(job.needs,'quality-gate');
  assert.equal(job.env.EXPO_PUBLIC_EXTERNAL_FREIGHT_FEED_ENABLED, "${{ inputs.enable_external_freight_feed && 'true' || 'false' }}");
  assert.ok(job.steps.find(step=>step.name==='Build release AAB'));
  assert.equal(workflow.on.workflow_dispatch.inputs.track.default,'internal');
  assert.equal(workflow.on.workflow_dispatch.inputs.status.default,'draft');
});
