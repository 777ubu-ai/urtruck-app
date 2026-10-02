import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/qa2-voice-job-readonly-audit.yml', 'utf8');
const sanitizer = fs.readFileSync('scripts/sanitize_qa2_voice_job_audit.py', 'utf8');

test('voice audit is manually dispatched, exact-source and read-only', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:\n\s+branches: \[fix\/qa2-voice-job-readonly-audit\]/);
  assert.match(workflow, /fix\/qa2-voice-job-readonly-audit/);
  assert.match(workflow, /inputs\.source_sha \|\| '0a4a63d008d60b707786bfbc172da5cd865d6b2f'/);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /PRAGMA query_only=ON/);
  assert.match(workflow, /mode=ro/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /retention-days: 7/);
  for (const forbidden of [/\bDELETE\b/, /\bUPDATE\b/, /\bINSERT\b/, /\brm\b/, /redis/i, /pm2/i, /OPENAI_API_KEY/, /Authorization:\s*Bearer/i]) {
    assert.doesNotMatch(workflow, forbidden);
  }
});

test('sanitizer never permits conversation or credential fields', () => {
  for (const forbidden of ['photo_url', 'voice_transcript', 'translated_text', 'locked_by', 'api_key']) {
    assert.equal(sanitizer.includes(forbidden), false, `unsafe field present: ${forbidden}`);
  }
  assert.match(sanitizer, /voice_job/);
  assert.match(sanitizer, /error_category/);
  assert.match(sanitizer, /latency_ms/);
  assert.match(sanitizer, /stage/);
});
