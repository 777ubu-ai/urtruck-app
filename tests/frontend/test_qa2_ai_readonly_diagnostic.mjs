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

  assert.equal(result.status, 1, result.stderr);
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
  const summary = rows.find((row) => row.kind === 'matrix_summary');
  assert.equal(summary.total, 60);
  assert.equal(summary.http_fail, 60);
});

test('structured checker accepts equivalents and rejects opposite cargo facts', () => {
  const code = String.raw`
import importlib.util
spec = importlib.util.spec_from_file_location('diagnostic', 'scripts/qa2_ai_readonly_diagnostic.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
assert module.semantic_check('zh', 'cargo', '阿拉木图到阿斯塔纳：货物1500美元，10吨，篷布车。')[0]
assert module.semantic_check('en', 'negation', 'Not a refrigerated truck; a tent truck is required, 20 tonnes.')[0]
assert module.semantic_check('ru', 'schedule', 'Урумчи, 09:30, дата 2026-10-01.')[0]
assert not module.semantic_check('ru', 'cargo', 'Алматы — Астана: 1500 USD, 10 тонн, водопад.')[0]
assert not module.semantic_check('zh', 'negation', '不是篷布车，需要冷藏车，20吨。')[0]
assert not module.semantic_check('en', 'price', 'Price 12,000, weight 15 tonnes.')[0]
assert not module.semantic_check('ru', 'negation', 'Не рефрижератор, но нужен рефрижератор, тент, 20 тонн.')[0]
assert not module.semantic_check('en', 'negation', 'Not a refrigerated truck, but a refrigerated truck is required; tent truck, 20 tonnes.')[0]
assert not module.semantic_check('zh', 'negation', '不是冷藏车，但需要冷藏车和篷布车，20吨。')[0]
assert not module.semantic_check('ru', 'short', 'Груз не готов.')[0]
assert not module.semantic_check('en', 'short', 'The cargo is not ready.')[0]
assert not module.semantic_check('zh', 'short', '货物还没有准备好。')[0]
`;
  const result = spawnSync('python3', ['-c', code], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('QA2 AI diagnostic source has no legacy application-data paths', () => {
  const source = fs.readFileSync(path.join(process.cwd(), runner), 'utf8');
  for (const forbidden of ['sqlite3', 'chat_messages', '/transcribe', 'transcript_text', 'voice_duration']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
