import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Проверка реально вложенной конфигурации QA2 APK запрещает выключенную ленту и подмену source', () => {
  const dir = mkdtempSync(join(tmpdir(), 'urtruck-apk-guard-'));
  try {
    const sha = 'a'.repeat(40);
    const apk = join(dir, 'fixture.apk');
    const make = (flag, source) => {
      const code = `import json,zipfile,sys\nwith zipfile.ZipFile(sys.argv[1], 'w') as z: z.writestr('assets/app.config',json.dumps({'extra':{'urtruckExternalFreightFeedEnabled':json.loads(sys.argv[2]),'urtruckSourceSha':sys.argv[3],'urtruckApiUrl':'https://qa2.example','urtruckBuildFlavor':'qa2'}}))`;
      assert.equal(spawnSync('python3', ['-c', code, apk, JSON.stringify(flag), source]).status, 0);
    };
    const check = () => spawnSync('python3', ['scripts/verify_qa2_apk_feed.py', apk, sha, 'https://qa2.example']);
    make(true, sha); assert.equal(check().status, 0);
    make(false, sha); assert.notEqual(check().status, 0);
    make(true, 'b'.repeat(40)); assert.notEqual(check().status, 0);
    make('true', sha); assert.notEqual(check().status, 0);
    make(false, sha);
    assert.notEqual(spawnSync('python3', ['scripts/verify_qa2_apk_feed.py', apk, sha, 'https://qa2.example'], { env: { ...process.env, PYTHONOPTIMIZE: '1' } }).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
