import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('qa report gate fails for synthetic P0/P1 and passes for clean report', () => {
  const reports = path.resolve('qa/reports');
  const file = path.join(reports, `qa-report-gate-test-${process.pid}.json`);
  const gate = path.resolve('scripts/check_qa_report_gate.js');
  const backup = fs.existsSync(file) ? fs.readFileSync(file) : null;
  try {
    fs.writeFileSync(file, JSON.stringify({ counts: { P0: 1, P1: 0 } }));
    const blocked = spawnSync(process.execPath, [gate], { encoding: 'utf8' });
    assert.equal(blocked.status, 1);

    fs.writeFileSync(file, JSON.stringify({ counts: { P0: 0, P1: 0 } }));
    const clean = spawnSync(process.execPath, [gate], { encoding: 'utf8' });
    assert.equal(clean.status, 0);
  } finally {
    if (backup) fs.writeFileSync(file, backup);
    else fs.rmSync(file, { force: true });
  }
});
