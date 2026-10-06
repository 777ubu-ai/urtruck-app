import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlayReleaseInputs } from '../../scripts/validate-play-release-inputs.mjs';

for (const status of ['halted', 'inProgress']) {
  test(`${status} requires an explicit fraction`, () => {
    assert.throws(() => validatePlayReleaseInputs(status), /required/);
    for (const value of ['0', '1', '-0.1', '1.1', 'NaN', 'Infinity', '0x01', '0.2\nINJECTED=true']) {
      assert.throws(() => validatePlayReleaseInputs(status, value), /decimal/);
    }
  });
  test(`${status} retains the caller fraction without a fallback`, () => {
    assert.deepEqual(validatePlayReleaseInputs(status, '0.25'), { status, userFraction: '0.25' });
  });
}
for (const status of ['draft', 'completed']) {
  test(`${status} never gets an implicit fraction`, () => {
    assert.deepEqual(validatePlayReleaseInputs(status), { status, userFraction: '' });
    assert.throws(() => validatePlayReleaseInputs(status, '0.01'), /only allowed/);
  });
}
test('unknown status is rejected', () => assert.throws(() => validatePlayReleaseInputs('unknown'), /Unsupported/));
test('Play workflow uses validated fraction and records actual upload outcome', () => {
  const source = readFileSync('.github/workflows/deploy-play.yml', 'utf8');
  assert.match(source, /node scripts\/validate-play-release-inputs\.mjs/);
  assert.match(source, /userFraction: \$\{\{ env\.PLAY_USER_FRACTION \}\}/);
  assert.match(source, /id: upload_to_play/);
  assert.match(source, /steps\.upload_to_play\.outcome/);
  assert.match(source, /upload requested/);
  assert.match(source, /upload outcome/);
});
