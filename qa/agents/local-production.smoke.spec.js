const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const { BASE_URL } = require('../utils/qaConfig');

function currentCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
  }).trim();
}

test('local production artifact serves exact build-info JSON', async ({ request }) => {
  const expectedCommit = process.env.PRODUCTION_EXPECTED_COMMIT || currentCommit();
  expect(expectedCommit).toMatch(/^[0-9a-f]{40}$/);

  const response = await request.get(`${BASE_URL}/build-info.json?local-qa=${Date.now()}`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/application\/json/i);
  const raw = await response.text();
  expect(raw).not.toMatch(/^\s*</);
  const buildInfo = JSON.parse(raw);
  expect(buildInfo.commit).toBe(expectedCommit);
  expect(buildInfo.short).toBe(expectedCommit.slice(0, 7));
  expect(buildInfo).toHaveProperty('built_at');
  expect(buildInfo).toHaveProperty('version');
});

test('local production artifact keeps the application shell separate', async ({ request }) => {
  const build = await request.get(`${BASE_URL}/build-info.json?local-qa=shell`);
  const root = await request.get(`${BASE_URL}/`);
  expect(build.headers()['content-type']).toMatch(/application\/json/i);
  expect(await root.text()).toMatch(/<html|<!doctype/i);
  expect(await build.text()).not.toMatch(/<html|<!doctype/i);
});

test('local production smoke stores evidence', async ({ page }) => {
  fs.mkdirSync('qa-artifacts/local-production-smoke', { recursive: true });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.screenshot({
    path: 'qa-artifacts/local-production-smoke/local-production.png',
    fullPage: true,
  });
});
