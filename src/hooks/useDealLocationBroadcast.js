// useDealLocationBroadcast — «Начать рейс» автоматически включает GPS на
// сервере. Хук передаёт координаты только для активных рейсов и прекращает
// передачу сразу после доставки/отмены.
//
// Google Play contract: this hook NEVER opens a permission prompt. Permission
// is requested only from the explicit Deal Workspace disclosure flow. Android
// location foreground service is started only while the app is visible; once
// started, the OS service keeps the active-trip task alive when minimized.
import { useEffect, useRef, useState } from 'react';
import { Platform, AppState } from 'react-native';
import { marketAPI } from '../utils/marketAPI';
import { storage } from '../utils/storage';
import { pushLocationToDeals, setActiveDealIds, startBackgroundTracking, stopBackgroundTracking } from '../utils/backgroundLocation';

const INTERVAL_MS = 25000;

export function useDealLocationBroadcast(activeDealIds) {
  const idsRef = useRef([]);
  const [permittedIds, setPermittedIds] = useState(null);
  const candidateKey = (Array.isArray(activeDealIds) ? activeDealIds : []).join(',');

  // Source of truth is /tracking/active, not the local deal list. Polling
  // starts promptly after «Начать рейс» and returns an empty list immediately
  // after delivery/cancellation.
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const token = await storage.get('ur_reg_token');
      const r = await marketAPI.activeTrackingDeals();
      if (!alive || r?.ok === false) return;
      if (!token || await storage.get('ur_reg_token') !== token || r?.ok !== true
          || !Array.isArray(r.deal_ids) || !r.deal_ids.every((id) => typeof id === 'string' && id.length > 0)) return;
      setPermittedIds(r.deal_ids);
    };
    // Server truth must be queried even when the local dashboard has not yet
    // hydrated. Clearing persisted IDs before this response used to kill a
    // perfectly valid background trip after app update/process restart.
    refresh();
    const iv = setInterval(refresh, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, [candidateKey]);

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
      if (!ids.length) {
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
    if (!idsRef.current.length) return;

    let Location = null;
    let granted = false;
    let timer = null;
    let mounted = true;

    const push = async () => {
      if (!granted || !Location || !idsRef.current.length) return;
      try {
        const token = await storage.get('ur_reg_token');
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const c = pos.coords || {};
        const payload = {
          lat: c.latitude, lng: c.longitude,
          heading: c.heading != null && c.heading >= 0 ? c.heading : null,
          speed: c.speed != null && c.speed >= 0 ? c.speed : null,
        };
        if (!mounted || !token || await storage.get('ur_reg_token') !== token) return;
        await pushLocationToDeals({ ...payload, timestamp: pos.timestamp }, idsRef.current);
      } catch {}
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
      if (timer) clearInterval(timer);
      sub?.remove?.();
    };
  }, [key]);
}

export default useDealLocationBroadcast;
