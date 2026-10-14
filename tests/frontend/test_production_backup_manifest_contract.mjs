import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/production-backup.yml', 'utf8');

test('production backup checksum manifest excludes itself and verifies every recorded payload', () => {
  assert.match(workflow, /find "\$DEST" -type f ! -name SHA256SUMS -print0 \| sort -z \| xargs -0 sha256sum > "\$DEST\/SHA256SUMS"/);
  assert.match(workflow, /sha256sum -c "\$DEST\/SHA256SUMS"/);
});
