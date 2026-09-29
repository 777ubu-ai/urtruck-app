import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/configure-qa2-routing.yml', 'utf8');
const script = readFileSync('scripts/configure_qa2_routing.sh', 'utf8');

test('QA2 routing workflow is manually protected and uses pinned SSH', () => {
  assert.match(workflow, /environment:\n\s+name: qa2/);
  assert.match(workflow, /OPENROUTESERVICE_API_KEY:\s*\$\{\{ secrets\.OPENROUTESERVICE_API_KEY \}\}/);
  assert.match(workflow, /SERVER_SSH_KEY:\s*\$\{\{ secrets\.SERVER_SSH_KEY \}\}/);
  assert.match(workflow, /SERVER_SSH_KNOWN_HOSTS:\s*\$\{\{ secrets\.SERVER_SSH_KNOWN_HOSTS \}\}/);
  assert.match(workflow, /CONFIGURE_QA2_ROUTING/);
  assert.match(workflow, /test "\$GITHUB_REF_NAME" = "qa2\/integration-candidate"/);
  assert.doesNotMatch(workflow, /\npush:/);
  assert.doesNotMatch(workflow, /SERVER_PASS|sshpass|StrictHostKeyChecking=no|refs\/heads\/main/);
});

test('routing procedure preserves local AI and systemd supervision with rollback', () => {
  for (const marker of [
    '.env.routing-backup.',
    'TRANSCRIBE_PROVIDER',
    'TRANSLATE_PROVIDER',
    'LOCAL_AI_URL',
    'OPENROUTESERVICE_API_KEY',
    'systemctl restart urtruck-qa2.service',
    'QA2_ROUTING=healthy-openrouteservice',
    'QA2_LOCAL_AI=preserved',
  ]) assert.ok(script.includes(marker), `missing ${marker}`);
  assert.match(workflow, /Roll back QA2 routing settings on failure/);
  assert.match(workflow, /cp -- "\$BACKUP" "\$qa_env"/);
  assert.match(workflow, /systemctl restart urtruck-qa2\.service/);
  assert.equal(script.match(/sudo -n ss -ltnpH 'sport = :8002'/g)?.length, 2);
  assert.doesNotMatch(script, /kill -TERM|kill -KILL|nohup|StrictHostKeyChecking=no|sshpass/);
});
