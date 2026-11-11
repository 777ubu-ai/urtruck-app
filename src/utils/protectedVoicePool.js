// Один активный плеер: ресурс не удаляется во время старта/воспроизведения.
export function createProtectedVoicePool(voice) {
  const entries = new Map();
  function dispose(entry) {
    if (entry.disposed) return;
    entry.disposed = true;
    entry.unsubscribe?.();
    if (entries.get(entry.scope) === entry) entries.delete(entry.scope);
    entry.resource.dispose();
  }
  function reconcile(entry) {
    if (entry.disposed || entry.refs > 0 || entry.pending > 0) return;
    const state = voice.getState?.();
    if (state?.uri !== entry.resource.uri) { dispose(entry); return; }
    if (!entry.unsubscribe) {
      let subscribing = true;
      let releaseAfterSubscribe = false;
      const unsubscribe = voice.subscribe?.(next => {
        if (next?.uri !== entry.resource.uri) {
          if (subscribing) releaseAfterSubscribe = true;
          else if (!entry.refs && !entry.pending) dispose(entry);
        }
      });
      subscribing = false;
      entry.unsubscribe = unsubscribe;
      if (releaseAfterSubscribe && !entry.refs && !entry.pending) dispose(entry);
      if (!unsubscribe && !entry.disposed) dispose(entry);
    }
  }
  return {
    acquire(scope) {
      const entry = entries.get(scope);
      if (!entry || entry.disposed) return null;
      entry.refs += 1;
      return entry.resource;
    },
    install(scope, resource) {
      const existing = entries.get(scope);
      if (existing && !existing.disposed) {
        resource.dispose();
        existing.refs += 1;
        return existing.resource;
      }
      entries.set(scope, { scope, resource, refs: 1, pending: 0, disposed: false, unsubscribe: null });
      return resource;
    },
    release(scope) {
      const entry = entries.get(scope);
      if (!entry || entry.disposed) return;
      entry.refs = Math.max(0, entry.refs - 1);
      reconcile(entry);
    },
    pending(scope, active) {
      const entry = entries.get(scope);
      if (!entry || entry.disposed) return;
      entry.pending = Math.max(0, entry.pending + (active ? 1 : -1));
      reconcile(entry);
    },
  };
}
