const { defineConfig } = require('@playwright/test');

// `*.live.spec.js` writes to production. Skipped from default runs; only
// included when one of these explicit guard env vars is set.
const liveAllowed = !!(
  process.env.RUN_LIVE_TESTS ||
  process.env.RUN_LIVE_DEAL_QA ||
  process.env.RUN_LIVE_DEAL_QA_DRY
);

module.exports = defineConfig({
  testDir: './tests/e2e',
  testIgnore: liveAllowed
    ? ['**/*debug*.spec.js']
    : ['**/*.live.spec.js', '**/*debug*.spec.js'],
  timeout: 60000,
  workers: 1,
  use: {
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
    headless: true,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
});
