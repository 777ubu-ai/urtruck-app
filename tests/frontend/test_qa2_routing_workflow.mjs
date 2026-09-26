import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/configure-qa2-routing.yml', 'utf8');
const script = readFileSync('scripts/configure_qa2_routing.sh', 'utf8');

test('QA2 routing workflow is protected and uses only the existing ORS secret', () => {
  assert.match(workflow, /environment:\n\s+name: qa2/);
  assert.match(workflow, /OPENROUTESERVICE_API_KEY:\s*\$\{\{ secrets\.OPENROUTESERVICE_API_KEY \}\}/);
  assert.match(workflow, /CONFIGURE_QA2_ROUTING/);
  assert.doesNotMatch(workflow, /production-deploy|refs\/heads\/main/);
});

test('routing procedure preserves local AI and provides a rollback backup', () => {
  for (const marker of [
    'backup_dir=',
    'TRANSCRIBE_PROVIDER',
    'TRANSLATE_PROVIDER',
    'LOCAL_AI_URL',
    'OPENROUTESERVICE_API_KEY',
    'QA2_ROUTING=healthy-openrouteservice',
    'QA2_LOCAL_AI=preserved',
  ]) assert.ok(script.includes(marker), `missing ${marker}`);
  assert.match(workflow, /Roll back QA2 routing settings on failure/);
  assert.match(workflow, /cp -- "\$BACKUP_DIR\/qa2\.env" "\$ENV_FILE"/);
});
