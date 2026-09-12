import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const artifactPath = resolve(root, 'dist', 'build-info.json');
const expectedCommit = (process.env.BUILD_INFO_SHA || execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
})).trim();

if (!/^[0-9a-f]{40}$/.test(expectedCommit)) {
  throw new Error(`Expected a full commit SHA, got: ${expectedCommit}`);
}

const raw = readFileSync(artifactPath, 'utf8');
if (/^\s*</.test(raw)) throw new Error('build-info.json contains HTML, not JSON');
const info = JSON.parse(raw);
if (info.commit !== expectedCommit) {
  throw new Error(`build-info commit mismatch: expected ${expectedCommit}, got ${info.commit}`);
}
if (info.short !== expectedCommit.slice(0, 7)) {
  throw new Error(`build-info short SHA mismatch: ${info.short}`);
}
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(info.built_at)) {
  throw new Error(`build-info built_at is not UTC: ${info.built_at}`);
}
const expectedVersionText = readFileSync(resolve(root, '.version'), 'utf8').trim();
const expectedVersion = (() => {
  try { return JSON.parse(expectedVersionText); } catch { return expectedVersionText; }
})();
if (info.version !== expectedVersion) {
  throw new Error(`build-info version mismatch: expected ${JSON.stringify(expectedVersion)}, got ${JSON.stringify(info.version)}`);
}

console.log(`WEB_BUILD_INFO_CONTRACT=PASS commit=${info.commit} version=${JSON.stringify(info.version)}`);
