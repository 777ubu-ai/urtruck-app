const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['**/*.live.spec.js', '**/*debug*.spec.js'],
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
