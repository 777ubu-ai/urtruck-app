// Keep only the latest startup tap, briefly and only in memory. Never persist
// notification payloads across logout/account switch. Server APIs still check
// room/event ownership; a click is not a read receipt.
export function createOneSignalClickBridge({ now = Date.now, ttl = 60000 } = {}) {
  let pending = null;
  let listener = null;
  const deliver = (item) => {
    if (!listener || now() - item.at > ttl) return;
    Promise.resolve().then(() => {
      if (listener === item.listener) return listener(item.response);
    }).catch(() => {});
  };
  return {
    receive(event) {
      const notification = event?.notification;
      if (!notification) return;
      const data = notification.additionalData;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      const item = {
        at: now(),
        response: { notification: { request: {
          identifier: notification.notificationId, content: { data: { ...data } },
        } } },
        listener,
      };
      if (listener) deliver(item);
      else pending = item;
    },
    subscribe(callback) {
      // A replacement subscriber represents a new authenticated session.
      if (listener) pending = null;
      listener = callback;
      if (pending) {
        const item = { ...pending, listener };
        pending = null;
        deliver(item);
      }
      return () => {
        if (listener === callback) { listener = null; pending = null; }
      };
    },
    clear() { pending = null; listener = null; },
  };
}
export const oneSignalClickBridge = createOneSignalClickBridge();
