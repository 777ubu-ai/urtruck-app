// Contract for the exact user-facing chat/voice strings requested after the
// QA2 physical smoke.  This reads locale data only; user messages and opaque
// logistics values are never translated by this contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/utils/i18n.js', 'utf8');
const match = source.match(/const translations = (\{[\s\S]*?\n\};)/);
assert.ok(match, 'translations object not found');
// eslint-disable-next-line no-eval
const translations = eval(`(${match[1].slice(0, -1)})`);

test('Russian chat translation controls are Russian', () => {
  assert.deepEqual(
    Object.fromEntries(['translate', 'translation_ready', 'translation_failed', 'repeat_action', 'voice_show_text']
      .map((key) => [key, translations.RU[key]])),
    {
      translate: 'Перевести',
      translation_ready: 'Переведено',
      translation_failed: 'Не удалось перевести',
      repeat_action: 'Повторить',
      voice_show_text: 'Показать текст',
    },
  );
});

test('Chinese chat translation controls are Chinese', () => {
  assert.deepEqual(
    Object.fromEntries(['translate', 'translation_ready', 'translation_failed', 'repeat_action', 'voice_show_text']
      .map((key) => [key, translations.ZH[key]])),
    {
      translate: '翻译',
      translation_ready: '已翻译',
      translation_failed: '无法翻译',
      repeat_action: '重试',
      voice_show_text: '查看文字',
    },
  );
});
