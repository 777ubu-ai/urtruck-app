// Per-account/per-room draft. Immediate serialized writes prevent a slower old
// edit from overwriting a newer value. Restoring never replaces current typing.
export function createChatDraft(storage, userId, roomId) {
  const key = userId && roomId ? `ur_draft_chat_${JSON.stringify([String(userId), String(roomId)])}` : null;
  let revision = 0, generation = 0, connected = false, tail = Promise.resolve();
  return {
    async connect(restore) {
      connected = true;
      const ownGeneration = ++generation, ownRevision = revision;
      if (!key) return;
      const raw = await storage.get(key);
      if (!connected || generation !== ownGeneration || revision !== ownRevision || !raw) return;
      try { const value = JSON.parse(raw); if (typeof value === 'string') restore(value); } catch {}
    },
    set(value) {
      revision++;
      if (!key || !connected) return Promise.resolve();
      tail = tail.catch(() => {}).then(() => value ? storage.set(key, JSON.stringify(value)) : storage.remove(key));
      return tail;
    },
    disconnect() { connected = false; generation++; },
  };
}
