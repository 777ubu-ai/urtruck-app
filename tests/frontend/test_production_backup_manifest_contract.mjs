import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/production-backup.yml', 'utf8');

test('production backup checksum manifest excludes itself and verifies every recorded payload', () => {
  assert.match(workflow, /find "\$DEST" -type f ! -name SHA256SUMS -print0 \| sort -z \| xargs -0 sha256sum > "\$DEST\/SHA256SUMS"/);
  assert.match(workflow, /sha256sum -c "\$DEST\/SHA256SUMS"/);
  assert.match(workflow, /write_source_inventory "\$REMOTE_DIR" frontend/);
  assert.match(workflow, /write_source_inventory "\$BACKEND_DIR" backend/);
  assert.match(workflow, /\$\{label\}-before\.sha256/);
  assert.match(workflow, /\$\{label\}-before-symlinks\.txt/);
  assert.doesNotMatch(workflow, /pm2\s+save/);
});
