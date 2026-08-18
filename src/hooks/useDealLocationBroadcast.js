// useDealLocationBroadcast — «Начать рейс» автоматически включает GPS на
// сервере. Хук передаёт координаты только для активных рейсов и прекращает
// передачу сразу после доставки/отмены.
//
// Google Play contract: this hook NEVER opens a permission prompt. Permission
// is requested only from the explicit Deal Workspace disclosure flow.
import { useEffect, useRef, useState } from 'react';
import { Platform, AppState } from 'react-native';
import { marketAPI } from '../utils/marketAPI';
import { setActiveDealIds, startBackgroundTracking, stopBackgroundTracking } from '../utils/backgroundLocation';

const INTERVAL_MS = 25000;

export function useDealLocationBroadcast(activeDealIds) {
  const idsRef = useRef([]);
  const [permittedIds, setPermittedIds] = useState([]);
  const candidateKey = (Array.isArray(activeDealIds) ? activeDealIds : []).join(',');

  // Source of truth is /tracking/active, not the local deal list. Polling
  // starts promptly after «Начать рейс» and returns an empty list immediately
  // after delivery/cancellation.
  useEffect(() => {
    if (!candidateKey) {
      setPermittedIds([]);
      return undefined;
    }
    let alive = true;
    const refresh = async () => {
      const r = await marketAPI.activeTrackingDeals();
      if (alive) setPermittedIds(Array.isArray(r?.deal_ids) ? r.deal_ids : []);
    };
    refresh();
    const iv = setInterval(refresh, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, [candidateKey]);

  idsRef.current = permittedIds;
  const key = permittedIds.join(',');

  // Store only server-approved deals. startBackgroundTracking checks existing
  // OS grants and cannot request anything by itself.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    setActiveDealIds(idsRef.current);
    if (idsRef.current.length) startBackgroundTracking();
    else stopBackgroundTracking();
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
        const c = pos.coords || {};
        const payload = {
          lat: c.latitude, lng: c.longitude,
          heading: c.heading != null && c.heading >= 0 ? c.heading : null,
          speed: c.speed != null && c.speed >= 0 ? c.speed : null,
        };
        for (const id of idsRef.current) marketAPI.sendDealLocation(id, payload);
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
