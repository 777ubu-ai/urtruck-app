// Guard для admin FILE_SIGNING_KEY bootstrap (#170): проверяет workflow +
// серверные скрипты на security-инварианты, чтобы review-фиксы не регрессировали.
// Комментарии игнорируются (нет false-positive).
import fs from 'node:fs';
import assert from 'node:assert/strict';

function readNoComments(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const stripped = raw
    .split('\n')
    .filter((l) => !l.trim().startsWith('#') && !l.trim().startsWith('//'))
    .join('\n');
  return { raw, stripped };
}

const WF = '.github/workflows/set-file-signing-key.yml';
const wf = readNoComments(WF);
const setKey = readNoComments('scripts/remote_set_signing_key.sh');
const health = readNoComments('scripts/remote_health_check.sh');
const verify = readNoComments('scripts/remote_signing_verify.sh');
const all = [wf, setKey, health, verify].map((x) => x.stripped).join('\n');

// ── триггеры и права (workflow) ─────────────────────────────
assert.ok(/^on:\s*[\r\n]+\s*workflow_dispatch:/m.test(wf.stripped), 'workflow должен быть только workflow_dispatch');
assert.ok(!/^\s*(push|schedule|pull_request|workflow_run|repository_dispatch):/m.test(wf.stripped),
  'запрещены авто-триггеры (push/schedule/pull_request/workflow_run/repository_dispatch)');
assert.ok(/permissions:\s*[\r\n]+\s*contents:\s*read/.test(wf.raw), 'permissions должны быть contents: read');
assert.ok(!/\bcontents:\s*write\b|\bactions:\s*write\b|\bpackages:\s*write\b/.test(wf.stripped), 'write-permissions запрещены');
assert.ok(/environment:\s*production/.test(wf.raw), 'должен ссылаться на environment: production');

// ── секрет не выводится (во ВСЕХ файлах) ────────────────────
assert.ok(!/echo\s+["']?\$\{?(KEY|FILE_SIGNING_KEY)\}?/.test(all), 'echo значения ключа запрещён');
assert.ok(!/printenv/.test(all), 'printenv запрещён');
assert.ok(!/(^|\s|;|&&|\|)env(\s|$|;)/.test(all.replace(/[A-Z_]+=/g, '')), 'голый env-дамп запрещён');
assert.ok(!/set\s+-x/.test(all), 'set -x запрещён (трейс раскроет секрет)');
assert.ok(!/cat\s+[^\n]*\.env/.test(all), 'cat .env запрещён');
assert.ok(!/upload-artifact[\s\S]{0,200}\.env/.test(all), 'upload-artifact с .env запрещён');
assert.ok(!/GITHUB_OUTPUT[\s\S]{0,80}(KEY|FILE_SIGNING)/.test(all), 'секрет в GITHUB_OUTPUT запрещён');
assert.ok(/unset KEY/.test(setKey.stripped), 'KEY должен быть unset после использования');
assert.ok(/printf 'FILE_SIGNING_KEY=%s/.test(setKey.stripped), 'KEY должен писаться в файл через printf');

// ── .env целостность (set-key) ──────────────────────────────
assert.ok(/FILE_SIGNING_KEY_COUNT=/.test(setKey.stripped) && /-eq 1|= "1"|!= "1"|-ne 1/.test(setKey.stripped) === false
  ? /FILE_SIGNING_KEY_COUNT=/.test(setKey.stripped) : true, 'count должен считаться');
assert.ok(/CNT.*=.*grep -cE '\^FILE_SIGNING_KEY='/.test(setKey.stripped), 'должна быть count-проверка строк FILE_SIGNING_KEY');
assert.ok(/\[ "\$CNT" = "1" \]/.test(setKey.stripped), 'должно падать если count != 1');
assert.ok(/grep -vE '\^FILE_SIGNING_KEY='/.test(setKey.stripped), 'дедуп: старая/пустая строка должна удаляться');
assert.ok(/trap 'rm -f "\$tmp"' EXIT/.test(setKey.stripped), 'temp .env должен чиститься через trap');
assert.ok(/cp -p /.test(setKey.stripped), 'backup .env должен сохранять права (cp -p)');

// ── health fail-closed (health) ─────────────────────────────
assert.ok(/curl --fail /.test(health.stripped), 'health-curl должен быть fail-closed (--fail)');
assert.ok(!/curl\s+-s[^\n]*\|\s*head/.test(all), 'запрещён недоказательный `curl -s ... | head` как health');
assert.ok(/--max-time/.test(health.stripped) && /--connect-timeout/.test(health.stripped), 'curl должен иметь таймауты');
assert.ok(/pm2 jlist/.test(health.stripped) && /status.*==.*'online'|== 'online'/.test(health.stripped), 'PM2 online proof обязателен');
assert.ok(/PM2_STATUS=online/.test(health.stripped), 'должен печатать PM2_STATUS=online');
assert.ok((health.stripped.match(/check_health/g) || []).length >= 2, 'нужен повторный health (crash-loop)');

// ── smoke cleanup (verify) ──────────────────────────────────
assert.ok(/trap 'rm -f "\$SMOKE"' EXIT/.test(verify.stripped), 'smoke-файл должен чиститься через trap EXIT');
assert.ok(/FILE_SIGNING_KEY_PRESENT=yes/.test(verify.stripped), 'должен печатать FILE_SIGNING_KEY_PRESENT=yes');

console.log('signing-key guard OK: dispatch-only, contents:read, environment:production, секрет не выводится, .env count==1+dedup+trap+backup-perms, health fail-closed+PM2 online+crash-loop, smoke trap-cleanup');
