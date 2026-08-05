// Офлайн-очередь: сохраняет действия когда нет сети, отправляет при восстановлении.
// Для водителей на трассе — плохой интернет частое явление.

import { Platform } from 'react-native';
import { storage } from './storage';

const QUEUE_KEY = 'ur_offline_queue';

let queue = [];
let syncing = false;

// Load on init
(async () => {
  try {
    const saved = await storage.get(QUEUE_KEY);
    if (saved) queue = JSON.parse(saved);
  } catch {}
})();

async function save() {
  await storage.set(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Добавить действие в очередь.
 * @param action {{ url: string, method: string, body: any, headers?: object }}
 */
export async function enqueue(action) {
  queue.push({
    ...action,
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    createdAt: Date.now(),
    retries: 0,
  });
  await save();
  // Попробуем сразу синхронизировать
  sync();
}

/**
 * Попробовать отправить все действия из очереди.
 */
export async function sync() {
  if (syncing || queue.length === 0) return;
  syncing = true;
  const failed = [];

  for (const item of [...queue]) {
    try {
      const r = await fetch(item.url, {
        method: item.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(item.headers || {}),
        },
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
      if (!r.ok && r.status >= 500) {
        // Серверная ошибка — ретрай
        item.retries = (item.retries || 0) + 1;
        if (item.retries < 5) failed.push(item);
      }
      // 4xx — не ретраим (клиентская ошибка)
    } catch {
      // Нет сети — оставляем в очереди
      item.retries = (item.retries || 0) + 1;
      if (item.retries < 10) failed.push(item);
    }
  }

  queue = failed;
  await save();
  syncing = false;
}

/**
 * Количество действий в очереди.
 */
export function pendingCount() {
  return queue.length;
}

/**
 * Блок 2 аудита (P1-5): полная очистка очереди — вызывается при logout,
 * чтобы отложенные действия вышедшего пользователя не реплеились под
 * следующей сессией на этом устройстве. На момент фикса `enqueue()` нигде
 * в проекте не вызывается (модуль не подключён к реальным экранам), но
 * очистка добавлена на будущее и по прямому требованию аудита — если
 * очередь когда-нибудь начнут использовать, logout уже будет безопасен.
 */
export async function clearQueue() {
  queue = [];
  await save();
}

// Авто-sync при восстановлении связи (web)
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[offline-queue] online — syncing...');
    sync();
  });
}
