import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('app.json', 'utf8');
const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const workflows = [
  '.github/workflows/production-backup.yml',
  '.github/workflows/production-performance-diagnosis.yml',
  '.github/workflows/secure-production-deploy.yml',
  '.github/workflows/set-file-signing-key.yml',
].map((path) => [path, fs.readFileSync(path, 'utf8')]);

test('native startup appearance is light and Android backup is fail-closed', () => {
  assert.match(app, /"backgroundColor":\s*"#(?:F6F8F7|FFFFFF)"/i);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.doesNotMatch(manifest, /android:allowBackup="true"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
});

test('privileged workflows use pinned SSH key transport only', () => {
  for (const [path, source] of workflows) {
    assert.doesNotMatch(source, /sshpass|SERVER_PASS/, `${path} still permits password transport`);
    assert.match(source, /SERVER_SSH_KEY/);
    assert.match(source, /SERVER_SSH_KNOWN_HOSTS/);
  }
});

test('backup archives explicitly exclude environment and private credential files', () => {
  const backup = workflows.find(([path]) => path === '.github/workflows/production-backup.yml')[1];
  assert.match(backup, /secret_files: excluded/);
  for (const pattern of ["--exclude='.env'", "--exclude='.env.*'", "--exclude='*.pem'", "--exclude='*.key'"]) {
    assert.ok(backup.includes(pattern), `missing ${pattern}`);
  }
  assert.doesNotMatch(backup, /cp -a "\$env_file"/);
});
