import { durableStorage } from './storage';

// Общие формы и кэши нельзя отдавать следующему владельцу устройства.
// Черновики публикации/чата уже имеют ownerId; их не удаляем и не переносим.
const SHARED_KEYS = new Set(['ur_driver_vehicle', 'ur_client_company', 'ur_pinned_chats', 'ur_queue_plate']);
const sharedWork = key => SHARED_KEYS.has(key) || (key.startsWith('ur_draft_') && !key.startsWith('ur_draft_chat_'));
const recoveryKey = (apiBase, ownerId) => `ur_session_recovery_v1:${encodeURIComponent(apiBase)}:${encodeURIComponent(ownerId || 'unknown')}`;
const PENDING_KEY = 'ur_session_recovery_required';

export async function saveSessionRecovery(record, storage = durableStorage) {
  const encoded = JSON.stringify(record);
  await storage.set(PENDING_KEY, encoded);
  if (await storage.get(PENDING_KEY) !== encoded) throw new Error('SESSION_RECOVERY_BACKUP_FAILED');
}

export async function clearSessionRecovery(storage = durableStorage) {
  await storage.remove(PENDING_KEY);
  if (await storage.get(PENDING_KEY) !== null) throw new Error('SESSION_RECOVERY_CLEAR_FAILED');
}

export async function readSessionRecovery(storage = durableStorage) {
  const raw = await storage.get(PENDING_KEY);
  if (!raw) return null;
  let record;
  try { record = JSON.parse(raw); } catch {
    // Сохраняем повреждённое значение отдельно; исходная работа не стирается.
    await storage.set('ur_session_recovery_corrupt_v1', raw);
  }
  if (record && typeof record.apiBase === 'string') return record;
  // Совместимость только с локальным маркером ранней реализации; источник неизвестен.
  let session;
  try { session = JSON.parse(await storage.get('ur_session') || 'null'); } catch {}
  return { apiBase: session?.apiBase || 'legacy:unknown', ownerId: session?.user?.id || null };
}

export async function clearSharedAndOwnedDrafts({ apiBase, ownerId }, storage = durableStorage) {
  for (const name of await storage.keys()) {
    let owned = false;
    if (name.startsWith('ur_draft_chat_')) {
      try { const [origin, owner] = JSON.parse(name.slice('ur_draft_chat_'.length)); owned = origin === apiBase && owner === ownerId; } catch {}
    }
    if (sharedWork(name) || owned) await storage.remove(name);
  }
}

// Вызывается только для неизменённого bearer, подтверждённого /me на bootstrap.
// Неизвестное происхождение legacy не является разрешением отправлять очереди.
export async function migrateVerifiedLegacyDrafts({ apiBase, ownerId }, storage = durableStorage) {
  const marker = `ur_legacy_drafts_migrated_v1:${encodeURIComponent(apiBase)}:${encodeURIComponent(ownerId)}`;
  if (!ownerId || await storage.get(marker) === '1') return;
  for (const source of await storage.keys()) {
    let target;
    if (source.startsWith('ur_publication_draft_v1:')) {
      const parts = source.split(':');
      if (parts.length === 3 && ['cargo','trip'].includes(parts[1]) && parts[2] === encodeURIComponent(ownerId)) {
        target = `ur_publication_draft_v1:${encodeURIComponent(apiBase)}:${parts[1]}:${parts[2]}`;
      }
    } else if (source.startsWith('ur_draft_chat_')) {
      try {
        const parts = JSON.parse(source.slice('ur_draft_chat_'.length));
        if (Array.isArray(parts) && parts.length === 2 && parts[0] === ownerId) target = 'ur_draft_chat_' + JSON.stringify([apiBase, ...parts]);
      } catch {}
    }
    if (!target || await storage.get(target) !== null) continue;
    const value = await storage.get(source);
    if (value === null) continue;
    await storage.set(target, value);
    if (await storage.get(target) !== value) throw new Error('SESSION_DRAFT_MIGRATION_FAILED');
  }
  await storage.set(marker, '1');
  if (await storage.get(marker) !== '1') throw new Error('SESSION_DRAFT_MIGRATION_FAILED');
}

export async function completeSessionRecovery(record, storage = durableStorage) {
  if (!record.isolated) {
    await quarantineSharedWork(record, storage);
    record = { ...record, isolated: true };
    await saveSessionRecovery(record, storage);
  }
  return record;
}

export async function quarantineSharedWork({ apiBase, ownerId }, storage = durableStorage) {
  const key = recoveryKey(apiBase, ownerId);
  const previous = JSON.parse(await storage.get(key) || '{}');
  const values = { ...(previous.restored ? {} : previous.values || {}) };
  for (const name of await storage.keys()) if (sharedWork(name)) values[name] = await storage.get(name);
  // Legacy-очередь не имеет доказанного владельца/окружения: сохраняем копию,
  // но никогда не восстанавливаем её в автоматическую отправку.
  const offlineQueue = await storage.get('ur_offline_queue');
  const encoded = JSON.stringify({ values, offlineQueue: offlineQueue || previous.offlineQueue || null, restored: false });
  await storage.set(key, encoded);
  if (await storage.get(key) !== encoded) throw new Error('SESSION_RECOVERY_BACKUP_FAILED');
  for (const name of Object.keys(values)) {
    await storage.remove(name);
    if (await storage.get(name) !== null) throw new Error('SESSION_RECOVERY_ISOLATION_FAILED');
  }
}

export async function restoreSharedWork({ apiBase, ownerId }, storage = durableStorage) {
  if (!ownerId) return;
  const key = recoveryKey(apiBase, ownerId);
  const record = JSON.parse(await storage.get(key) || '{}');
  if (!record.values || record.restored) return;
  for (const [name, value] of Object.entries(record.values)) {
    if (!sharedWork(name) || value === null || await storage.get(name) !== null) continue;
    await storage.set(name, value);
    if (await storage.get(name) !== value) throw new Error('SESSION_RECOVERY_RESTORE_FAILED');
  }
  await storage.set(key, JSON.stringify({ ...record, restored: true }));
  // Копию сохраняем: подтверждение входа не является разрешением удалить работу.
}
