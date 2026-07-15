// Tiny pub/sub for cross-screen badge sync.
//
// Problem (build 15): BottomNav polls /chat/unread every 30s + on
// AppState='active'. When the user opens a chat and reads messages,
// backend marks them is_read=1 (via GET /chat/messages/{id}), but
// BottomNav doesn't know until the next 30s poll — badge stays.
//
// Fix: ChatScreen calls `notifyChatRead()` on mount and on unmount.
// BottomNav subscribes and refetches unread immediately. Same hook
// can be used for other places (e.g. notifications mark-all-read).
//
// Why not Context: avoids re-rendering the whole tree on every
// notification — only the listeners react.

const listeners = new Set();

export function subscribeChatRead(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function notifyChatRead() {
  for (const cb of listeners) {
    try { cb(); } catch {}
  }
}

// Параллельная шина для УВЕДОМЛЕНИЙ (колокол / бейдж «Рейсы», Вариант Б).
// MyWork при фокусе помечает события сделок прочитанными и зовёт
// notifyNotifRead() → useUnreadNotifications мгновенно перечитывает счётчик,
// и бейдж на «Рейсы» гаснет сразу (а не через 12-сек polling).
const notifListeners = new Set();

export function subscribeNotifRead(cb) {
  notifListeners.add(cb);
  return () => notifListeners.delete(cb);
}

export function notifyNotifRead() {
  for (const cb of notifListeners) {
    try { cb(); } catch {}
  }
}
