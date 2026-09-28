import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const runner = 'scripts/qa2_ai_readonly_diagnostic.py';

test('QA2 AI diagnostic is safe without an opt-in flag', () => {
  const temporaryAiRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'urtruck-safe-ai-'));
  const result = spawnSync('python3', [runner], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      ...process.env,
      QA2_AI_ROOT: temporaryAiRoot,
      QA2_AI_URL: 'http://127.0.0.1:9',
    },
  });
  fs.rmSync(temporaryAiRoot, { recursive: true, force: true });

  assert.equal(result.status, 0, result.stderr);
  const rows = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(rows[0], {
    kind: 'diagnostic_policy',
    mode: 'safe_default',
    application_data: 'not_read',
    mutation: 'none',
  });
  const translations = rows.filter((row) => row.kind === 'safe_translation');
  assert.equal(translations.length, 60);
  assert.ok(translations.every((row) => row.cache_hit === false));
  assert.ok(translations.every((row) => row.input_text));
});

test('QA2 AI diagnostic source has no legacy application-data paths', () => {
  const source = fs.readFileSync(path.join(process.cwd(), runner), 'utf8');
  for (const forbidden of ['sqlite3', 'chat_messages', '/transcribe', 'transcript_text', 'voice_duration']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
