import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bidModal = readFileSync(new URL('../../src/components/BidModal.js', import.meta.url), 'utf8');
const marketAPI = readFileSync(new URL('../../src/utils/marketAPI.js', import.meta.url), 'utf8');

test('BidModal displays grouped currency input while submitting numeric amount', () => {
  assert.match(bidModal, /const digitsOnly = \(value\) => String\(value \|\| ''\)\.replace/);
  assert.match(bidModal, /const groupDigits = \(value\) => digitsOnly\(value\)\.replace/);
  assert.match(bidModal, /value=\{groupDigits\(bid\)\}/);
  assert.match(bidModal, /onChangeText=\{\(value\) => setBid\(digitsOnly\(value\)\)\}/);
  assert.match(bidModal, /parseInt\(digitsOnly\(bid\), 10\)/);
  assert.match(bidModal, /currencyPrefix: \{ fontSize: 18, fontWeight: '700', marginRight: 0 \}/);
});

test('createBid logs safe HTTP diagnostics for the iPhone server-connection gate', () => {
  assert.match(marketAPI, /function logHttpDiagnostic\(operation, endpoint, startedAt, detail = \{\}\)/);
  assert.match(marketAPI, /console\.warn\(`\[marketAPI:\$\{operation\}\]`/);
  assert.match(marketAPI, /endpoint,\s+status: detail\.status \?\? null,/);
  assert.match(marketAPI, /error_class: detail\.errorClass \?\? null,/);
  assert.match(marketAPI, /request_ms: Math\.round\(nowMs\(\) - startedAt\)/);
  assert.match(marketAPI, /if \(k\.includes\('token'\) \|\| k === 'authorization' \|\| k\.includes\('secret'\)\) return '\[redacted\]';/);
  assert.match(marketAPI, /logHttpDiagnostic\('createBid', endpoint, startedAt,/);
});
