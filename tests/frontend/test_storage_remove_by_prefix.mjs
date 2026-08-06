// Блок 2/8 аудита (P1-5): storage.removeByPrefix — используется в
// AuthContext.signOut() для вычистки динамических ключей черновиков
// (ur_draft_<id>), у которых нет фиксированного набора имён.
import assert from 'node:assert/strict';
import AsyncStorageMock from './mocks/async-storage.mjs';
import { storage } from '../../src/utils/storage.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  AsyncStorageMock.__reset();
  try {
    await fn();
    passed++; console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++; console.log(`  ❌ ${name}: ${e.message}`);
  }
}

await test('removeByPrefix удаляет только совпадающие ключи', async () => {
  await storage.set('ur_draft_reg_step2', JSON.stringify({ a: 1 }));
  await storage.set('ur_draft_cargo_form', JSON.stringify({ b: 2 }));
  await storage.set('ur_session', 'keep-me');
  await storage.set('ur_lang', 'ru');
  await storage.removeByPrefix('ur_draft_');
  assert.equal(await storage.get('ur_draft_reg_step2'), null);
  assert.equal(await storage.get('ur_draft_cargo_form'), null);
  assert.equal(await storage.get('ur_session'), 'keep-me');
  assert.equal(await storage.get('ur_lang'), 'ru');
});

await test('removeByPrefix на пустом хранилище не падает', async () => {
  await storage.removeByPrefix('ur_draft_');
});

console.log(`\n${failed === 0 ? 'ВСЕ ЗЕЛЁНЫЕ' : failed + ' FAIL'} (passed=${passed}, failed=${failed})`);
process.exit(failed === 0 ? 0 : 1);
