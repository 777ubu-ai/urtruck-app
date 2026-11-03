import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync('.github/workflows/deploy-play.yml', 'utf8');
const scripts = [...workflow.matchAll(/<<'STOREVERIFY'\n([\s\S]*?)\n          STOREVERIFY/g)]
  .map(match => match[1].split('\n').map(line => line.replace(/^          /, '')).join('\n'));
const source = 'a'.repeat(40);
const config = { version: '1.0.14', android: { package: 'com.urtruck.app' }, extra: {
  urtruckApiUrl: 'https://qa2.urtruck.kz', urtruckBuildFlavor: 'production',
  urtruckSourceSha: source, urtruckExternalFreightFeedEnabled: true,
} };

test('полная проверка конфигурации выполняется до Gradle и после получения AAB', () => {
  assert.equal(scripts.length, 2);
  assert.ok(workflow.indexOf("<<'STOREVERIFY'") < workflow.indexOf('- name: Build release AAB'));
  assert.ok(workflow.lastIndexOf("<<'STOREVERIFY'") > workflow.indexOf('- name: Verify built AAB identity and versionCode'));
});

for (const [index, script] of scripts.entries()) {
  for (const [name, patch, env, valid] of [
    ['SHA приложения отличается от SHA workflow', {}, {}, true],
    ['чужой SHA', { extra: { ...config.extra, urtruckSourceSha: 'b'.repeat(40) } }, {}, false],
    ['неверный API', { extra: { ...config.extra, urtruckApiUrl: 'https://urtruck.kz' } }, {}, false],
    ['QA APK вместо магазинного package', { android: { package: 'com.urtruck.app.qa2' } }, {}, false],
    ['неверная версия', { version: '1.0.12' }, {}, false],
    ['не задан исходник', {}, { URTRUCK_SOURCE_SHA: '' }, false],
  ]) {
    test(`${index === 0 ? 'До компиляции' : 'Готовый AAB'}: ${name}`, () => {
      const root = mkdtempSync(join(tmpdir(), 'urtruck-store-source-'));
      try {
        const path = join(root, 'config.json'); writeFileSync(path, JSON.stringify({ ...config, ...patch }));
        const result = spawnSync(process.execPath, ['--input-type=module', '-', path], { input: script, encoding: 'utf8',
          env: { ...process.env, URTRUCK_SOURCE_SHA: source, GITHUB_SHA: 'c'.repeat(40), API_ENVIRONMENT: 'qa2', PLAY_TRACK: 'internal', URTRUCK_VERSION_NAME: '1.0.14', ...env } });
        assert.equal(result.status === 0, valid, result.stderr);
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }
}
