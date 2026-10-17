// useDealLocationBroadcast — «Начать рейс» автоматически включает GPS на
// сервере. Хук передаёт координаты только для активных рейсов и прекращает
// передачу сразу после доставки/отмены.
//
// Google Play contract: this hook NEVER opens a permission prompt. Permission
// is requested only from the explicit Deal Workspace disclosure flow. Android
// temporary foreground-only mode stops native tracking; fresh fixes are
// cancellable and never continue after minimizing or locking the phone.
import { useEffect, useRef, useState } from 'react';
import { Platform, AppState } from 'react-native';
import { marketAPI } from '../utils/marketAPI';
import { storage } from '../utils/storage';
import { pushLocationToDeals, setActiveDealIds, startBackgroundTracking, stopBackgroundTracking, FOREGROUND_LOCATION_ONLY, getCurrentLocationPayload } from '../utils/backgroundLocation';

const INTERVAL_MS = 25000;

export function useDealLocationBroadcast(activeDealIds) {
  const idsRef = useRef([]);
  const [permittedIds, setPermittedIds] = useState(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => sub?.remove?.();
  }, []);
  useEffect(() => {
    if (FOREGROUND_LOCATION_ONLY) stopBackgroundTracking();
  }, []);
  const candidateKey = (Array.isArray(activeDealIds) ? activeDealIds : []).join(',');

  // Source of truth is /tracking/active, not the local deal list. Polling
  // starts promptly after «Начать рейс» and returns an empty list immediately
  // after delivery/cancellation.
  useEffect(() => {
    if (!foreground) return undefined;
    let alive = true;
    let refreshing = false;
    const refresh = async () => {
      if (!alive || refreshing || AppState.currentState !== 'active') return;
      refreshing = true;
      try {
        const token = await storage.get('ur_reg_token');
        const r = await marketAPI.activeTrackingDeals();
        if (!alive || r?.ok === false) return;
        if (!token || await storage.get('ur_reg_token') !== token || r?.ok !== true
            || !Array.isArray(r.deal_ids) || !r.deal_ids.every((id) => typeof id === 'string' && id.length > 0)) return;
        setPermittedIds(r.deal_ids);
      } catch { /* Offline не выключает системный GPS принятого рейса. */ }
      finally { refreshing = false; }
    };
    // Server truth must be queried even when the local dashboard has not yet
    // hydrated. Clearing persisted IDs before this response used to kill a
    // perfectly valid background trip after app update/process restart.
    refresh();
    const iv = setInterval(refresh, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, [candidateKey, foreground]);

  if (Array.isArray(permittedIds)) idsRef.current = permittedIds;
  const key = Array.isArray(permittedIds) ? permittedIds.join(',') : null;

  // Store only server-approved deals. startBackgroundTracking checks existing
  // OS grants and cannot request anything by itself. On Android 14+ a location
  // foreground service must be started while the app is visible, so a delayed
  // server response never causes an illegal background service start.
  useEffect(() => {
    if (Platform.OS === 'web' || key === null) return undefined;

    let alive = true;
    const syncTracking = async ({ forceReconfigure = false } = {}) => {
      const ids = idsRef.current;
      await setActiveDealIds(ids);
      if (!alive) return;
      if (FOREGROUND_LOCATION_ONLY || !ids.length) {
        await stopBackgroundTracking();
        return;
      }
      if (Platform.OS === 'android' && AppState.currentState !== 'active') return;
      await startBackgroundTracking({ forceReconfigure });
    };

    syncTracking();
    const sub = AppState.addEventListener('change', (state) => {
      // Returning from Android system Location settings must replace an
      // existing-but-silent Expo registration. This stays strictly visible:
      // a background transition never starts/restarts the foreground service.
      if (state === 'active' && idsRef.current.length) syncTracking({ forceReconfigure: true });
    });

    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, [key]);

  useEffect(() => {
    if (!foreground || !idsRef.current.length) return undefined;

    let Location = null;
    let granted = false;
    let timer = null;
    let mounted = true;
    let pushing = false;
    const controller = new AbortController();

    const push = async () => {
      if (!mounted || pushing || AppState.currentState !== 'active'
          || !granted || !Location || !idsRef.current.length) return;
      pushing = true;
      try {
        const token = await storage.get('ur_reg_token');
        const payload = await getCurrentLocationPayload({ signal: controller.signal });
        if (!payload) return;
        if (!mounted || AppState.currentState !== 'active'
            || !token || await storage.get('ur_reg_token') !== token) return;
        await pushLocationToDeals(payload, idsRef.current);
      } catch {}
      finally { pushing = false; }
    };

    (async () => {
      try {
        Location = await import('expo-location');
        const { status } = await Location.getForegroundPermissionsAsync();
        granted = status === 'granted';
        if (!granted || !mounted) return;
        push();
        timer = setInterval(push, INTERVAL_MS);
      } catch {}
    })();

    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') push(); });
    return () => {
      mounted = false;
      controller.abort();
      if (timer) clearInterval(timer);
      sub?.remove?.();
    };
  }, [key, foreground]);
}

export default useDealLocationBroadcast;
