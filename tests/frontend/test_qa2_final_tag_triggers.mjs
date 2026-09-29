import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name) => readFileSync(`.github/workflows/${name}`, 'utf8');

const workflows = [
  ['deploy-qa2-final-integration.yml', 'qa2-final-deploy-', 'DEPLOY_QA2_FINAL'],
  ['configure-qa2-fcm.yml', 'qa2-final-fcm-', 'CONFIGURE_QA2_FCM'],
  ['configure-qa2-routing-secure.yml', 'qa2-final-routing-', 'CONFIGURE_QA2_ROUTING_SECURE'],
  ['configure-qa2-cgr.yml', 'qa2-final-cgr-', 'CONFIGURE_QA2_CGR'],
  ['verify-qa2-cgr-live.yml', 'qa2-final-verify-cgr-', 'VERIFY_QA2_CGR_LIVE'],
];

test('QA2 final workflows support exact-SHA protected tag and branch triggers', () => {
  for (const [file, prefix, manualConfirmation] of workflows) {
    const workflow = read(file);
    assert.ok(workflow.includes('push:'), `${file}: push trigger`);
    assert.ok(workflow.includes(`'${prefix}*'`), `${file}: tag filter`);
    assert.ok(workflow.includes('branches:'), `${file}: branch fallback filter`);
    assert.ok(workflow.includes('"$GITHUB_REF_TYPE" = branch'), `${file}: branch fallback check`);
    assert.ok(workflow.includes(`"${prefix}$QA_SOURCE_SHA"`), `${file}: exact tag check`);
    assert.ok(workflow.includes('test "$QA_SOURCE_SHA" = "$GITHUB_SHA"'), `${file}: exact SHA check`);
    assert.ok(workflow.includes('git merge-base --is-ancestor'), `${file}: merged source check`);
    assert.ok(workflow.includes(manualConfirmation), `${file}: manual confirmation preserved`);
    assert.ok(workflow.includes('name: qa2'), `${file}: protected QA2 environment`);
    assert.equal(workflow.includes('refs/heads/main'), false, `${file}: main remains untouched`);
  }
});
