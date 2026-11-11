import test from 'node:test';
import assert from 'node:assert/strict';
import { optionalProfileFields, changedOptionalProfileFields } from '../../src/utils/registrationOptionalProfile.js';

test('неизменённые дополнительные данные не попадают в PATCH', () => {
  const initial = optionalProfileFields({ company_name: 'Компания', country: 'KZ', city: 'Алматы', messenger_type: 'telegram', messenger_id: '@driver' });
  assert.deepEqual(changedOptionalProfileFields(initial, { ...initial }), {});
});

test('явное изменение и очистка передаются, другие поля не затрагиваются', () => {
  const initial = optionalProfileFields({ company_name: 'Компания', city: 'Алматы', messenger_type: 'telegram', messenger_id: '@driver' });
  assert.deepEqual(changedOptionalProfileFields(initial, { ...initial, company_name: '', city: 'Астана' }), { company_name: '', city: 'Астана' });
});

test('пустой профиль не создаёт побочных изменений', () => {
  const initial = optionalProfileFields({});
  assert.deepEqual(changedOptionalProfileFields(initial, { ...initial }), {});
});

test('черновик не перезаписывает поля, которые пользователь не менял', () => {
  const currentServer = optionalProfileFields({ company_name: 'Новое название', city: 'Алматы' });
  const oldDraft = { ...currentServer, company_name: 'Старое название', city: 'Астана' };
  assert.deepEqual(changedOptionalProfileFields(currentServer, oldDraft, ['city']), { city: 'Астана' });
});
