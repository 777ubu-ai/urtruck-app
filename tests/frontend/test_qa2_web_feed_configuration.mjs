import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('QA2 web deploy включает внешнюю ленту при сборке', () => {
  const source = readFileSync('.github/workflows/qa2-web-deploy.yml', 'utf8');
  const build = source.slice(source.indexOf('      - name: Build QA web'), source.indexOf('      - name: Pin configured SSH', source.indexOf('      - name: Build QA web')));
  assert.match(build, /EXPO_PUBLIC_EXTERNAL_FREIGHT_FEED_ENABLED:\s*'true'/);
  assert.match(build, /npm run build:web/);
  assert.match(build, /EXPO_PUBLIC_WEB_URL:\s*https:\/\/qa2\.urtruck\.kz/);
});
