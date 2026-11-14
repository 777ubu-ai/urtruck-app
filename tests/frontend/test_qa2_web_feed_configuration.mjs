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

test('QA2 web и адресный backend deploy используют разные jobs и точный исходник', () => {
  const source = readFileSync('.github/workflows/qa2-web-deploy.yml', 'utf8');
  assert.match(source, /deploy:\s*\n\s*if: inputs\.confirmation == 'DEPLOY_QA2_WEB'/);
  assert.match(source, /vehicle-window:\s*\n\s*if: inputs\.confirmation != 'DEPLOY_QA2_WEB'/);
  assert.match(source, /VERIFY_QA2_VEHICLE_WINDOW/);
  assert.match(source, /DEPLOY_QA2_VEHICLE_WINDOW/);
  assert.match(source, /test "\$QA_SOURCE_SHA" = "\$GITHUB_SHA"/);
  assert.match(source, /test "\$\(git rev-parse FETCH_HEAD\)" = "\$QA_SOURCE_SHA"/);
  assert.match(source, /python3 scripts\/qa\/deploy_qa2_vehicle_window\.py/);
});
