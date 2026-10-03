import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/qa2-translation-readonly-diagnostic.yml', 'utf8');
const diagnostic = fs.readFileSync('scripts/qa2_translation_readonly_diagnostic.py', 'utf8');
const validator = fs.readFileSync('scripts/validate_qa2_translation_readonly_diagnostic.py', 'utf8');

test('translation diagnostic is manually dispatched, scoped and read-only', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /GITHUB_REF_NAME" = "qa2\/integration-candidate"/);
  assert.match(workflow, /QA_SOURCE_SHA: \$\{\{ inputs\.source_sha \}\}/);
  assert.match(workflow, /PRAGMA query_only=ON/);
  assert.match(diagnostic, /mode=ro/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /retention-days: 7/);
  for (const forbidden of [/\bDELETE\b/, /\bUPDATE\b/, /\bINSERT\b/, /\bredis\b/i, /\bpm2\b/i, /OPENAI_API_KEY/, /Authorization:\s*Bearer/i]) {
    assert.doesNotMatch(workflow, forbidden);
    assert.doesNotMatch(diagnostic, forbidden);
  }
});

test('diagnostic artifact validator excludes content-bearing fields', () => {
  for (const forbidden of ['translated_text', 'voice_transcript', 'audio', 'api_key', 'bearer', 'room_id', 'sender_id']) {
    assert.equal(validator.includes(forbidden), false, `unsafe artifact field: ${forbidden}`);
  }
  assert.match(validator, /provider_contract_case/);
  assert.match(validator, /stored_controlled_message/);
});
