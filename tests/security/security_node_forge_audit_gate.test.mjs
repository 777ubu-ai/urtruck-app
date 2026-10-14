import assert from 'node:assert/strict';
import test from 'node:test';
import {ADVISORY_URL, evaluateAudit} from '../../scripts/security-node-forge-audit-gate.mjs';

const expectedAdvisory = {
  name: 'node-forge',
  url: ADVISORY_URL,
  range: '<=1.4.0',
  severity: 'high',
};

test('audit compensation allows only the transitive GHSA-86w9-cpqp-85rv chain', () => {
  const audit = {vulnerabilities: {
    expo: {severity: 'high', via: ['@expo/cli']},
    '@expo/cli': {severity: 'high', via: ['node-forge']},
    'node-forge': {severity: 'high', via: [expectedAdvisory]},
  }};
  assert.deepEqual(evaluateAudit(audit), []);
});

test('audit compensation blocks every independent high or critical advisory', () => {
  const audit = {vulnerabilities: {
    'node-forge': {severity: 'high', via: [expectedAdvisory]},
    unrelated: {severity: 'critical', via: [{
      name: 'unrelated', url: 'https://github.com/advisories/GHSA-test',
      range: '*', severity: 'critical',
    }]},
  }};
  assert.deepEqual(evaluateAudit(audit), [{
    name: 'unrelated', severity: 'critical', via: audit.vulnerabilities.unrelated.via,
  }]);
});

test('audit compensation blocks a second node-forge advisory', () => {
  const audit = {vulnerabilities: {
    'node-forge': {severity: 'high', via: [expectedAdvisory, {
      name: 'node-forge', url: 'https://github.com/advisories/GHSA-other',
      range: '*', severity: 'high',
    }]},
  }};
  assert.equal(evaluateAudit(audit).length, 1);
});
