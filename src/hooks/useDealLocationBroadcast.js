// useDealLocationBroadcast — «Начать рейс» автоматически включает GPS на
// сервере. Хук передаёт координаты только для активных рейсов и прекращает
// передачу сразу после доставки/отмены.
import { useEffect, useRef, useState } from 'react';
import { Platform, AppState } from 'react-native';
import { marketAPI } from '../utils/marketAPI';
import { setActiveDealIds, startBackgroundTracking, stopBackgroundTracking } from '../utils/backgroundLocation';
import { normalizeLocationPayload } from '../utils/gpsQuality';

const INTERVAL_MS = 25000;

export function useDealLocationBroadcast(activeDealIds) {
  const idsRef = useRef([]);
  const [permittedIds, setPermittedIds] = useState([]);
  const [state, setState] = useState({
    mode: 'idle', lastSentAt: null, error: null, offline: false, terminal: false,
  });
  const candidateKey = (Array.isArray(activeDealIds) ? activeDealIds : []).join(',');

  // Source of truth is /tracking/active, not the local deal list. Polling
  // starts promptly after «Начать рейс» and returns an empty list immediately
  // after delivery/cancellation.
  useEffect(() => {
    if (!candidateKey) {
      setPermittedIds([]);
      setState((current) => ({ ...current, mode: 'terminal', terminal: true, error: null, offline: false }));
      return undefined;
    }
    let alive = true;
    const refresh = async () => {
      const r = await marketAPI.activeTrackingDeals();
      if (!alive) return;
      if (!r?.ok) {
        // Fail closed: do not continue sending under an unconfirmed server
        // state. Keep the last-send timestamp, but expose the outage.
        setPermittedIds([]);
        setState((current) => ({ ...current, mode: 'paused', offline: !!r?.offline, error: r?.offline ? 'offline' : 'server_error' }));
        return;
      }
      const nextIds = Array.isArray(r.deal_ids) ? r.deal_ids : [];
      setPermittedIds(nextIds);
      setState((current) => ({
        ...current,
        mode: nextIds.length ? current.mode : 'terminal',
        terminal: !nextIds.length,
        offline: false,
        error: null,
      }));
    };
    refresh();
    const iv = setInterval(refresh, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, [candidateKey]);

  idsRef.current = permittedIds;
  const key = permittedIds.join(',');

  // Фоновый трекинг: список только разрешённых сделок кладём в storage.
  // Empty list immediately stops the OS task after decline/stop/completion.
  useEffect(() => {
    let alive = true;
    setActiveDealIds(idsRef.current);
    if (idsRef.current.length) {
      if (Platform.OS === 'web') {
        setState((current) => ({ ...current, mode: 'foreground_only', error: null }));
        return () => { alive = false; };
      }
      startBackgroundTracking().then((result) => {
        if (!alive) return;
        setState((current) => ({
          ...current,
          mode: result?.mode || (Platform.OS === 'android' || Platform.OS === 'web' ? 'foreground_only' : 'background'),
          error: result?.ok ? null : (result?.reason || 'background_error'),
        }));
      });
    } else {
      stopBackgroundTracking();
    }
    return () => { alive = false; };
  }, [key]);

  useEffect(() => {
    if (!idsRef.current.length) return;

    let Location = null;
    let granted = false;
    let timer = null;
    let mounted = true;

    const push = async () => {
      if (!granted || !Location || !idsRef.current.length) return;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const payload = normalizeLocationPayload(pos);
        if (!payload) {
          setState((current) => ({ ...current, error: 'invalid_location', offline: false }));
          return;
        }
        const results = await Promise.all(idsRef.current.map((id) => marketAPI.sendDealLocation(id, payload)));
        if (!mounted) return;
        const offline = results.some((r) => r?.offline);
        const ok = results.length > 0 && results.every((r) => r?.ok);
        setState((current) => ({
          ...current,
          mode: Platform.OS === 'android' || Platform.OS === 'web' ? 'foreground_only' : current.mode,
          lastSentAt: ok ? new Date().toISOString() : current.lastSentAt,
          error: ok ? null : (offline ? 'offline' : 'server_rejected'),
          offline,
          terminal: false,
        }));
      } catch {
        if (mounted) setState((current) => ({ ...current, error: 'location_unavailable', offline: false }));
      }
    };

    (async () => {
      try {
        Location = await import('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        granted = status === 'granted';
        if (!granted || !mounted) return;
        push();
        timer = setInterval(push, INTERVAL_MS);
      } catch {}
    })();

    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') push(); });
    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
      sub?.remove?.();
    };
  }, [key]);

  return state;
}

export default useDealLocationBroadcast;
