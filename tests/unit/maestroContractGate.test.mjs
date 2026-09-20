import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const gate = path.join(repoRoot, 'qa', 'utils', 'maestroContractSmoke.js');

function runGate(root) {
  return spawnSync(process.execPath, [gate], {
    cwd: repoRoot,
    env: { ...process.env, MAESTRO_ROOT: root },
    encoding: 'utf8',
  });
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'urtruck-maestro-gate-'));
  writeFileSync(path.join(root, 'smoke-suite.yaml'), [
    'appId: host.exp.Exponent',
    '---',
    '- runFlow: canonical.yaml',
    '',
  ].join('\n'));
  writeFileSync(path.join(root, 'canonical.yaml'), [
    'appId: host.exp.Exponent',
    '---',
    '- assertVisible: { id: "bottom-nav-deals" }',
    '',
  ].join('\n'));
  return root;
}
test('Maestro gate accepts canonical selectors across the full tree', () => {
  const root = fixture();
  try {
    const result = runGate(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2 flows/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Maestro gate rejects stale selectors outside smoke-suite references', () => {
  const root = fixture();
  try {
    writeFileSync(path.join(root, 'forgotten.yaml'), [
      'appId: host.exp.Exponent',
      '---',
      '- tapOn: { id: "bottom-nav-profile" }',
      '',
    ].join('\n'));
    const result = runGate(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /forgotten\.yaml: stale active selector bottom-nav-profile/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('Maestro gate rejects obsolete directories and missing references', () => {
  const root = fixture();
  try {
    const obsolete = path.join(root, '_obsolete');
    mkdirSync(obsolete);
    writeFileSync(path.join(obsolete, 'old.yaml'), 'appId: host.exp.Exponent\n---\n');
    writeFileSync(path.join(root, 'broken.yaml'), [
      'appId: host.exp.Exponent',
      '---',
      '- runFlow: missing.yaml',
      '',
    ].join('\n'));
    const result = runGate(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /obsolete Maestro flow remains tracked/);
    assert.match(result.stderr, /missing referenced flow missing\.yaml/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
