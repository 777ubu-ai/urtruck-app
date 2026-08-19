import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = fs.readFileSync('qa/playwright.config.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('PR/local desktop QA excludes production smoke unless explicitly enabled', () => {
  assert.match(config, /QA_INCLUDE_PRODUCTION_SMOKE === '1'/);
  assert.match(config, /includeProductionSmoke \? \[/);
  assert.match(config, /name: 'production-smoke'/);
});

test('production smoke remains explicitly runnable after deploy', () => {
  assert.equal(
    pkg.scripts['qa:production-smoke'],
    'QA_INCLUDE_PRODUCTION_SMOKE=1 playwright test --config qa/playwright.config.js --project=production-smoke',
  );
});
