import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const distDir = resolve(root, 'dist');
const requestedSha = process.env.BUILD_INFO_SHA?.trim();
const commit = requestedSha || execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();

if (!/^[0-9a-f]{40}$/.test(commit)) {
  throw new Error(`BUILD_INFO_SHA must be a full 40-character commit SHA, got: ${commit}`);
}

const versionText = readFileSync(resolve(root, '.version'), 'utf8').trim();
if (!versionText) throw new Error('.version is empty');

let version;
try {
  version = JSON.parse(versionText);
} catch {
  version = versionText;
}

mkdirSync(distDir, { recursive: true });
const buildInfo = {
  commit,
  short: commit.slice(0, 7),
  built_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  version,
};

writeFileSync(resolve(distDir, 'build-info.json'), `${JSON.stringify(buildInfo)}\n`);
console.log(`WEB_BUILD_INFO=ok commit=${commit} version=${JSON.stringify(version)}`);
