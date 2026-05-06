// Stage 29: Playwright config dedicated to the ErrorBoundary
// hunt. Heavy artefacts (always-on trace + video + screenshots)
// so we never lose a reproduction. Spec lives in qa/debug/.

const { defineConfig } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: path.resolve(__dirname, 'debug'),
  timeout: 180000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ignoreHTTPSErrors: true,
    screenshot: 'on',
    video: 'on',
    trace: 'on',
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
  },
  projects: [
    { name: 'debug', use: {} },
  ],
});
