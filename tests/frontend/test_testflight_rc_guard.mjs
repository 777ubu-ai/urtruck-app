import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProductionProfile } from '../../qa/utils/testflightRcGuard.mjs';

test('RC guard ignores legitimate development and preview profiles', () => {
  assert.doesNotThrow(() => validateProductionProfile({
    build: {
      development: { developmentClient: true, distribution: 'internal' },
      preview: { distribution: 'internal' },
      production: { ios: { simulator: false }, android: { autoIncrement: true } },
    },
  }));
});

test('RC guard rejects unsafe production profile', () => {
  assert.throws(
    () => validateProductionProfile({ build: { production: { developmentClient: true } } }),
    /developmentClient/,
  );
  assert.throws(
    () => validateProductionProfile({ build: { production: { distribution: 'internal' } } }),
    /internal distribution/,
  );
  assert.throws(
    () => validateProductionProfile({ build: { production: { ios: { simulator: true } } } }),
    /simulator/,
  );
});
