import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateAudit} from '../../scripts/dependency-security-gate.mjs';

const advisory = {name: 'node-forge', url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv',
  range: '<=1.4.0', severity: 'high'};

test('исправленный upstream не допускает прежнюю компенсированную цепочку', () => {
  const audit = {vulnerabilities: {
    expo: {severity: 'high', via: ['@expo/cli']},
    '@expo/cli': {severity: 'high', via: ['node-forge']},
    'node-forge': {severity: 'high', via: [advisory]},
  }};
  assert.deepEqual(evaluateAudit(audit).map(item => item.name), ['expo', '@expo/cli', 'node-forge']);
});

test('все moderate/high/critical блокируют проверку, low не скрывает high', () => {
  const vulnerabilities = Object.fromEntries(['low', 'moderate', 'high', 'critical']
    .map(severity => [severity, {severity, via: [advisory]}]));
  assert.deepEqual(evaluateAudit({vulnerabilities}).map(item => item.name), ['moderate', 'high', 'critical']);
});

test('пустой отчёт допускается, отсутствие результата аудита отклоняется', () => {
  assert.deepEqual(evaluateAudit({vulnerabilities: {}}), []);
  assert.throws(() => evaluateAudit({}), /vulnerabilities/);
});
