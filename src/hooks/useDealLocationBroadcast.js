// useDealLocationBroadcast — GPS передаётся только по сделкам, которые
// водитель ЯВНО разрешил на сервере. Статус «сделка в работе» сам по себе
// никогда не включает GPS.
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
  // keeps a declined/stopped request from sending even if the app is still
  // open, and starts promptly after a driver accepts from the deal chat.
  useEffect(() => {
    if (Platform.OS === 'web' || !candidateKey) {
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

  // Фоновый трекинг: список только разрешённых сделок кладём в storage.
  // Empty list immediately stops the OS task after decline/stop/completion.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    setActiveDealIds(idsRef.current);
    if (idsRef.current.length) startBackgroundTracking();
    else stopBackgroundTracking();
  }, [key]);

  useEffect(() => {
    if (Platform.OS === 'web') return;            // в вебе геолокации нет
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
}

export default useDealLocationBroadcast;
