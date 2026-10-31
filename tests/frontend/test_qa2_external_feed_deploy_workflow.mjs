import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/deploy-qa2-external-feed.yml', 'utf8');
const script = readFileSync('scripts/qa/deploy_external_feed_candidate.sh', 'utf8');

test('external-feed QA2 deploy requires promoted exact SHA and full quality gate', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /INSTALL_URTRUCK_FEED_QA2/);
  assert.match(workflow, /test "\$QA_SOURCE_SHA" = "\$GITHUB_SHA"/);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/quality-gate-reusable\.yml/);
  assert.match(workflow, /needs: \[feed-preflight, required-quality-gate\]/);
  assert.match(workflow, /environment:\s*\n\s+name: qa2/);
});

test('deployment script is scoped to feed components, online backups, and code-only rollback', () => {
  for (const marker of [
    'external_freight_classifier.py', 'external_freight_import_adapter.py',
    'external_freight_queue_bridge.py', 'external-feed-owned/adapter.sqlite3',
    'src.backup(dst)', 'PRAGMA quick_check', 'EXTERNAL_FREIGHT_DEPLOYMENT_TARGET',
    'external-feed-component-manifest', 'flock -n 9',
  ]) assert.ok(script.includes(marker), `missing deploy invariant: ${marker}`);
  assert.match(script, /urtruck-qa2-feed-bridge\.service/);
  assert.match(script, /urtruck-qa2-owned-feed-bridge\.service/);
  assert.match(script, /urtruck-telegram-feed\.service/);
  assert.doesNotMatch(script, /systemctl restart[^\n]*production/i);
  assert.match(script, /# Code backup and consistent online snapshots; database snapshots are never restored over newer live state\./);
});
