// Разовое свежее измерение с ограничением времени и отменой нативной подписки.
// Таймаут Promise сам по себе не выключает датчики: remove нужен и для
// подписки, которая разрешилась уже после отмены/сворачивания приложения.
export function captureForegroundPosition(location, { appState, signal, timeoutMs = 8000, now = Date.now } = {}) {
  if (signal?.aborted || (appState && appState.currentState !== 'active')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const began = now();
    let finished = false;
    let subscription = null;
    let listener = null;
    let timer = null;
    const finish = (point = null) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      try { subscription?.remove?.(); } catch {}
      try { listener?.remove?.(); } catch {}
      signal?.removeEventListener?.('abort', cancel);
      resolve(point);
    };
    const cancel = () => finish();
    timer = setTimeout(cancel, timeoutMs);
    signal?.addEventListener?.('abort', cancel, { once: true });
    listener = appState?.addEventListener?.('change', state => { if (state !== 'active') cancel(); });
    if (signal?.aborted || (appState && appState.currentState !== 'active')) { cancel(); return; }
    try {
      Promise.resolve(location.watchPositionAsync({ accuracy: location.Accuracy.Balanced, distanceInterval: 0, timeInterval: 1000 }, point => {
        const c = point?.coords;
        const timestamp = Number(point?.timestamp);
        if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)
            || Math.abs(c.latitude) > 90 || Math.abs(c.longitude) > 180
            || !Number.isFinite(timestamp) || timestamp < began - 5000 || timestamp > now() + 5000) return;
        if (appState && appState.currentState !== 'active') { cancel(); return; }
        finish(point);
      }, cancel)).then(value => {
        subscription = value;
        if (finished) { try { subscription?.remove?.(); } catch {} }
      }, cancel);
    } catch { cancel(); }
  });
}
