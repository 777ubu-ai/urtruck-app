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

test('загрузка профиля различает 401, 403, ошибки сервера и смену сессии', async () => {
  const { loadRegistrationProfile } = await import('../../src/utils/registrationOptionalProfile.js');
  const args = { base: '/api/v1', token: 'token-a', getToken: async () => 'token-a' };
  for (const [status, reason] of [[401, 'session_expired'], [403, 'profile_v2_save_failed'], [500, 'server_unavailable']]) {
    const result = await loadRegistrationProfile({ ...args, fetcher: async () => ({ ok: false, status }) });
    assert.equal(result.error, reason);
  }
  const switched = await loadRegistrationProfile({ ...args, getToken: async () => 'token-b', fetcher: async () => ({ ok: true, json: async () => ({ id: 'user-a' }) }) });
  assert.equal(switched.error, 'session_expired');
});

test('загрузка профиля сохраняет данные при сетевой ошибке и принимает свой ответ', async () => {
  const { loadRegistrationProfile } = await import('../../src/utils/registrationOptionalProfile.js');
  const args = { base: '/api/v1', token: 't', getToken: async () => 't' };
  const offline = await loadRegistrationProfile({ ...args, fetcher: async () => { throw new Error('offline'); } });
  assert.equal(offline.error, 'no_connection');
  const ok = await loadRegistrationProfile({ ...args, fetcher: async () => ({ ok: true, json: async () => ({ id: 'owner', company_name: 'сохранено' }) }) });
  assert.equal(ok.profile.company_name, 'сохранено');
});
