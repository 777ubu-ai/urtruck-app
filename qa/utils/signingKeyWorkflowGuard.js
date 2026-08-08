// Guard для .github/workflows/set-file-signing-key.yml: workflow не должен
// (1) авто-триггериться, (2) выводить значение ключа в stdout, (3) читать
// .env целиком (cat). Значение секрета рождается на сервере и не транзитит.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const f = '.github/workflows/set-file-signing-key.yml';
const raw = fs.readFileSync(f, 'utf8');
// strip comment lines (# ... и YAML-комменты) — проверяем только исполняемое
const s = raw.split('\n').filter(l => !l.trim().startsWith('#')).join('\n');

// dispatch-only
assert.ok(/^on:\s*[\r\n]+\s*workflow_dispatch:/m.test(s), 'workflow должен быть только workflow_dispatch');
assert.ok(!/^\s*(push|schedule|pull_request):/m.test(s.replace(/#.*/g,'')), 'не должно быть push/schedule/pull_request триггеров');

// нет вывода значения ключа в stdout и нет cat .env
assert.ok(!/echo\s+["']?\$?\{?KEY\}?["']?\s*$/m.test(s), 'echo $KEY в stdout запрещён');
assert.ok(!/cat\s+[^\n]*\.env/.test(s), 'cat .env запрещён (может вывести секрет)');
assert.ok(/unset KEY/.test(s), 'KEY должен быть unset после использования');
// значение пишется только в файл (>> "$tmp"), не в stdout
assert.ok(/printf 'FILE_SIGNING_KEY=%s/.test(s) && />> .*tmp/.test(s), 'KEY должен писаться в temp-файл (>>), не в stdout');

// доп. security-инварианты (STEP admin PR review):
assert.ok(!/printenv/.test(s), 'printenv запрещён (может вывести секрет)');
assert.ok(!/(^|\s|;|&&)env(\s|$|;)/.test(s.replace(/[A-Z_]+=/g,'')), 'голый env-дамп запрещён');
assert.ok(!/set\s+-x/.test(s), 'set -x запрещён (трейс может раскрыть секрет)');
assert.ok(!/upload-artifact[\s\S]{0,200}\.env/.test(s), 'upload-artifact с .env запрещён');
assert.ok(!/GITHUB_OUTPUT[\s\S]{0,80}(KEY|FILE_SIGNING)/.test(s), 'секрет в GITHUB_OUTPUT запрещён');
// минимальные permissions
assert.ok(/permissions:\s*[\r\n]+\s*contents:\s*read/.test(raw), 'permissions должны быть contents: read');

console.log('signing-key workflow guard OK: dispatch-only, значение не выводится, .env/printenv/env/set-x/artifact/GITHUB_OUTPUT чисто, permissions:read, KEY unset');
