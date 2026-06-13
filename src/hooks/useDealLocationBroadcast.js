// useDealLocationBroadcast — водитель шлёт свою гео-позицию по активным
// сделкам (задача B). Только нативно, только пока приложение в foreground,
// только при наличии сделок «в работе». Фоновый GPS (когда приложение
// закрыто) — отдельная итерация (expo-task-manager); сейчас обновляем,
// пока водитель в приложении.
import { useEffect, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import { marketAPI } from '../utils/marketAPI';

const INTERVAL_MS = 25000;

export function useDealLocationBroadcast(activeDealIds) {
  const idsRef = useRef([]);
  idsRef.current = Array.isArray(activeDealIds) ? activeDealIds : [];
  const key = idsRef.current.join(',');

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
