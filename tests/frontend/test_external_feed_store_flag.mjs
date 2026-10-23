import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), yaml=require('yaml');
const workflow=yaml.parse(readFileSync('.github/workflows/deploy-play.yml','utf8'));
test('магазинный флаг внешней ленты явный, default off, не меняет upload/signing/API gates',()=>{
 const input=workflow.on.workflow_dispatch.inputs.enable_external_freight_feed;
 assert.equal(input.type,'boolean');assert.equal(input.default,false);
 const job=workflow.jobs['build-and-submit'];
 assert.equal(job.needs,'quality-gate');
 assert.equal(job.env.EXPO_PUBLIC_EXTERNAL_FREIGHT_FEED_ENABLED,"${{ inputs.enable_external_freight_feed && 'true' || 'false' }}");
 assert.equal(workflow.on.workflow_dispatch.inputs.submit_to_play.default,true);
 assert.ok(job.steps.some(s=>s.name==='Проверить среду и ограничить QA2 внутренним треком'));
 assert.ok(job.steps.some(s=>s.name==='Decode upload keystore'));
 assert.ok(job.steps.some(s=>s.id==='upload_to_play'&&s.if==="${{ github.event_name != 'workflow_dispatch' || inputs.submit_to_play }}"));
});
