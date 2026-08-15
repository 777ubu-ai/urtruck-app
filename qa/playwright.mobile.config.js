const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const SPECS_DIR = path.resolve(__dirname, 'mobile');
const captureAll = process.env.QA_CAPTURE_ALL === '1';

const baseUse = {
  ignoreHTTPSErrors: true,
  screenshot: captureAll ? 'on' : 'only-on-failure',
  video: captureAll ? 'on' : 'retain-on-failure',
  trace: captureAll ? 'on-first-retry' : 'retain-on-failure',
  locale: 'ru-RU',
  timezoneId: 'Asia/Almaty',
};

module.exports = defineConfig({
  testDir: SPECS_DIR,
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/mobile', open: 'never' }]],
  globalSetup: require.resolve('./utils/qaGlobalSetup.js'),
  use: baseUse,
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'], ...baseUse },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'], browserName: 'webkit', ...baseUse },
    },
  ],
});
