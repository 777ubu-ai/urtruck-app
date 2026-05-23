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
