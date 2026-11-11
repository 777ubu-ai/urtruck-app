// Не прерывать воспроизведение при прокрутке, но освободить Blob после остановки.
export function releaseProtectedVoice({ uri, voice, accountChanged, revoke }) {
  if (!uri) return;
  let released = false;
  let unsubscribe;
  const release = () => {
    if (released) return;
    released = true;
    try { revoke(uri); } finally { unsubscribe?.(); }
  };
  const state = voice.getState?.();
  if (state?.uri !== uri || !state.isPlaying) { release(); return; }
  if (accountChanged) {
    try { Promise.resolve(voice.stop?.()).then(release, release); } catch { release(); }
    return;
  }
  unsubscribe = voice.subscribe?.(next => {
    if (next?.uri !== uri || !next.isPlaying) release();
  });
  if (released) unsubscribe?.();
  if (!unsubscribe) release();
}
