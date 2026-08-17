// STEP 3 / Item 3 (08.08.2026): регресс-guard против повторного коммита
// release-keystore/приватных ключей подписи. Старый upload keystore уже
// попал в историю git (скомпрометирован, см. RELEASE_SIGNING.md) — этот
// smoke не даёт снова добавить *.jks/*.keystore/*.p12 в трекинг.
// Разрешён только android/app/debug.keystore (публичный debug-ключ Android).
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';

let tracked = '';
try {
  tracked = execSync('git ls-files', { encoding: 'utf8' });
} catch (e) {
  console.log('git ls-files недоступен — smoke пропущен (не CI-окружение)');
  process.exit(0);
}

const ALLOW = new Set(['android/app/debug.keystore']);
const offenders = tracked
  .split('\n')
  .map((s) => s.trim())
  .filter((f) => /\.(jks|keystore|p12)$/i.test(f) && !ALLOW.has(f));

assert.equal(offenders.length, 0,
  `В git отслеживаются keystore/ключи подписи (запрещено): ${offenders.join(', ')}`);

console.log('keystore-guard OK: приватных keystore в трекинге нет (только debug.keystore)');
