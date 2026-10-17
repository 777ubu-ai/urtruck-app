// Polling timers own an AppState subscription and exist only while visible.
// Return an opaque cleanup handle instead of leaving intervals alive in background.
import { AppState } from 'react-native';

export function createForegroundInterval(callback, delay, appState, timers = globalThis) {
  let stopped = false;
  let timer = null;
  let generation = 0;
  let running = false;
  const invoke = () => {
    if (running || stopped || appState.currentState !== 'active') return;
    running = true;
    try {
      const result = callback();
      Promise.resolve(result).catch(() => {}).finally(() => { running = false; });
    } catch { running = false; }
  };
  let active = appState.currentState === 'active';
  const clear = () => {
    generation++;
    if (timer !== null) timers.clearInterval(timer);
    timer = null;
  };
  const start = () => {
    const epoch = ++generation;
    timer = timers.setInterval(() => {
      if (!stopped && epoch === generation && appState.currentState === 'active') invoke();
    }, delay);
  };
  if (active) start();
  const listener = appState.addEventListener('change', next => {
    const visible = next === 'active';
    if (stopped || visible === active) return;
    active = visible;
    clear();
    if (visible) { start(); invoke(); }
  });
  return () => { stopped = true; clear(); listener?.remove?.(); };
}

export const setForegroundInterval = (callback, delay) => createForegroundInterval(callback, delay, AppState);
export const clearForegroundInterval = stop => stop?.();
