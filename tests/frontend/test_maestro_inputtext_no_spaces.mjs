// P0 2026-09-02 (Phase 3) — Maestro `inputText` без пробелов.
//
// Root cause `%20` bug: Maestro `inputText: "text with spaces"` на Android
// использует adb shell input text, который не escape'ит пробелы
// консистентно. Физическое подтверждение 2026-08-31 на Xiaomi.
//
// Правило: любая `inputText:` строка длиной > 1 слово должна использовать
// `-` или `_` вместо пробелов. См. qa/maestro/_lib/README-inputtext-spaces.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function collectYamls(dir) {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      // Skip _obsolete
      if (e.name.startsWith('_obsolete')) continue;
      out.push(...collectYamls(p));
    } else if (e.name.endsWith('.yaml') || e.name.endsWith('.yml')) {
      out.push(p);
    }
  }
  return out;
}

const yamls = [
  ...collectYamls('.maestro'),
  ...collectYamls('qa/maestro'),
];

test(`во всех Maestro yaml (${yamls.length} файлов) нет unsafe inputText со внутренними пробелами`, () => {
  const bad = [];
  for (const p of yamls) {
    const src = readFileSync(p, 'utf8');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Ищем: inputText: "..." или inputText: "..." где строка содержит
      // ВНУТРЕННИЙ пробел (не начинается/заканчивается пробелом-only).
      const m = line.match(/^\s*-?\s*inputText:\s*(?:'([^']+)'|"([^"]+)")\s*$/);
      if (!m) continue;
      const value = m[1] || m[2];
      // Разрешено: одно слово, или переменная ${...}, или строка-пробел " "
      if (value.startsWith('${')) continue;
      if (/^\s+$/.test(value)) continue;                    // пробелы-only отдельным action
      // Внутренние пробелы → плохо
      const trimmed = value.trim();
      if (/\s/.test(trimmed)) {
        bad.push(`${p}:${i + 1}: inputText: "${value}"`);
      }
    }
  }
  assert.equal(bad.length, 0,
    `Найдены unsafe inputText с внутренними пробелами (Maestro %20 bug):\n  ${bad.join('\n  ')}\n` +
    `Fix: заменить пробелы на "-" или "_"; assertions обновить в lockstep. ` +
    `См. qa/maestro/_lib/README-inputtext-spaces.md.`);
});

test('README-inputtext-spaces.md существует и упомянут в helper folder', () => {
  const readme = readFileSync('qa/maestro/_lib/README-inputtext-spaces.md', 'utf8');
  assert.match(readme, /root cause|%20|inputText/i);
});
