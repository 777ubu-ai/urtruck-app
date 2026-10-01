import test from 'node:test';
import assert from 'node:assert/strict';

async function loadBadgeWith(setBadgeCountAsync) {
  const previous = globalThis.require;
  globalThis.require = (specifier) => {
    if (specifier === 'expo-notifications') return { setBadgeCountAsync };
    if (typeof previous === 'function') return previous(specifier);
    throw new Error(`unexpected module ${specifier}`);
  };
  const module = await import(`../../src/utils/appBadge.js?case=${Date.now()}-${Math.random()}`);
  return { module, restore: () => { globalThis.require = previous; } };
}

test('Xiaomi ShortcutBadgeException preserves the canonical non-zero value', async () => {
  const { module, restore } = await loadBadgeWith(async () => {
    const error = new Error('Unable to execute badge');
    error.name = 'ShortcutBadgeException';
    throw error;
  });
  try {
    const result = await module.setAppIconBadge(3);
    assert.deepEqual(result, {
      badge: 3,
      applied: false,
      reason: 'launcher_badge_unsupported',
    });
  } finally {
    restore();
  }
});

test('a launcher false result is not reported as a successful reset', async () => {
  const { module, restore } = await loadBadgeWith(async () => false);
  try {
    assert.deepEqual(await module.setAppIconBadge(7), {
      badge: 7,
      applied: false,
      reason: 'launcher_badge_unsupported',
    });
  } finally {
    restore();
  }
});
