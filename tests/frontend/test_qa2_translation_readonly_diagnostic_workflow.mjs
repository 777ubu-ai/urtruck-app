import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/qa2-translation-readonly-diagnostic.yml', 'utf8');
const diagnostic = fs.readFileSync('scripts/qa2_translation_readonly_diagnostic.py', 'utf8');
const validator = fs.readFileSync('scripts/validate_qa2_translation_readonly_diagnostic.py', 'utf8');
const validatorPath = 'scripts/validate_qa2_translation_readonly_diagnostic.py';

const CASES = [
  'ru_no_plate_city', 'ru_plate_only', 'ru_city_only', 'ru02_plate_city',
  'zh_no_plate_city', 'zh_plate_only', 'zh_city_only', 'zh02_plate_city',
];
const SHA = 'd4d8bbbe7aa7f312da6693ed1633422f01880aa5';

function artifact() {
  const rows = [
    { kind: 'diagnostic_policy', sqlite_mode: 'ro', sqlite_query_only: true, application_mutation: 'none', application_content_output: 'none', provider_payload_output: 'none' },
    { kind: 'runtime_identity', stage: 'before', expected_source_sha: SHA, backend_source_sha: SHA, ai_source_sha: SHA, status: 'matched' },
    { kind: 'active_database', state: 'active_process_db_path' },
    ...['ru02_plate_city', 'zh02_plate_city'].map((caseName, index) => ({
      kind: 'stored_controlled_message', case: caseName, lookup_outcome: 'found', message_id: index + 100,
      created_at: 'REDACTED_TO_CONTROLLED_DAY', stored_source_lang: 'UNKNOWN_not_persisted_for_text',
      stored_target_lang: 'UNKNOWN_failed_request_not_persisted', message_cache: 'no_success_row',
      shared_cache: 'no_matching_auto_rows', historical_reason_codes: 'UNKNOWN_not_persisted_on_failed_translation',
    })),
    { kind: 'runtime_identity', stage: 'after', expected_source_sha: SHA, backend_source_sha: SHA, ai_source_sha: SHA, status: 'matched' },
    ...CASES.flatMap((caseName) => ['fresh', 'repeat'].map((attempt) => ({
      kind: 'provider_contract_case', case: caseName, attempt, source_lang_requested: 'auto',
      source_lang_expected: caseName.startsWith('ru') ? 'ru' : 'zh',
      target_lang_requested: caseName.startsWith('ru') ? 'zh' : 'ru', source_lang_reported: 'UNKNOWN',
      transport_outcome: 'http', http_status: 200, safe_error_category: 'none', reason_codes: [],
      identifier_exact: true, city_semantic_present: true, response_ms: 1.25,
      probe_cache: 'not_applicable_direct_loopback_provider_call',
    }))),
    { kind: 'reason_code_trace', backend: 'LocalAIError_reason_codes_to_HTTP_422_detail', mobile: 'chatAPI_parses_reasonCodes_boolean_only_UI_state', persistence: 'historical_failed_translation_reason_codes_UNKNOWN' },
  ];
  return rows;
}

function validate(rows) {
  return spawnSync('python3', [validatorPath, '-'], {
    input: `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, encoding: 'utf8',
  });
}

test('translation diagnostic is manually dispatched, scoped, runtime-bound and read-only', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /GITHUB_REF_NAME" = "qa2\/integration-candidate"/);
  assert.match(workflow, /QA_SOURCE_SHA: \$\{\{ inputs\.source_sha \}\}/);
  assert.match(workflow, /QA_SOURCE_SHA='\$QA_SOURCE_SHA'/);
  assert.match(workflow, /PRAGMA query_only=ON/);
  assert.match(diagnostic, /mode=ro/);
  assert.match(diagnostic, /runtime_changed_during_provider_probe/);
  assert.doesNotMatch(diagnostic, /rglob\(/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /retention-days: 7/);
  for (const forbidden of [/\bDELETE\b/, /\bUPDATE\b/, /\bINSERT\b/, /\bredis\b/i, /\bpm2\b/i, /OPENAI_API_KEY/, /Authorization:\s*Bearer/i]) {
    assert.doesNotMatch(workflow, forbidden);
    assert.doesNotMatch(diagnostic, forbidden);
  }
});

test('strict validator accepts the complete safe synthetic artifact', () => {
  const result = validate(artifact());
  assert.equal(result.status, 0, result.stderr);
});

test('strict validator rejects a missing required field', () => {
  const rows = artifact();
  delete rows.find((row) => row.kind === 'provider_contract_case').source_lang_reported;
  assert.notEqual(validate(rows).status, 0);
});

test('strict validator rejects an ordinary sentence in an enum field', () => {
  const rows = artifact();
  rows.find((row) => row.kind === 'provider_contract_case').safe_error_category = 'ordinary descriptive sentence';
  assert.notEqual(validate(rows).status, 0);
});

test('strict validator rejects a sentence in reason_codes', () => {
  const rows = artifact();
  rows.find((row) => row.kind === 'provider_contract_case').reason_codes = ['this is a sentence'];
  assert.notEqual(validate(rows).status, 0);
});

test('strict validator rejects invalid HTTP types and negative latency', () => {
  const rows = artifact();
  const provider = rows.find((row) => row.kind === 'provider_contract_case');
  provider.http_status = 'invalid';
  provider.response_ms = -1;
  assert.notEqual(validate(rows).status, 0);
});

test('strict validator accepts a terminal runtime-mismatch artifact without provider results', () => {
  const rows = [
    artifact()[0],
    { kind: 'runtime_identity', stage: 'before', expected_source_sha: SHA, backend_source_sha: 'UNKNOWN', ai_source_sha: SHA, status: 'runtime_mismatch' },
    { kind: 'diagnostic_abort', reason: 'runtime_mismatch_before_provider_probe' },
  ];
  assert.equal(validate(rows).status, 0);
});

test('validator source excludes content-bearing evidence fields', () => {
  for (const forbidden of ['translated_text', 'voice_transcript', 'audio', 'api_key', 'bearer', 'room_id', 'sender_id']) {
    assert.equal(validator.includes(forbidden), false, `unsafe artifact field: ${forbidden}`);
  }
  assert.match(validator, /provider_contract_case/);
  assert.match(validator, /stored_controlled_message/);
});
