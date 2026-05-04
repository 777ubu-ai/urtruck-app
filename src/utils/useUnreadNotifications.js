// useUnreadNotifications — fetches the server-side unread counter every
// 30s (and on AppState 'active'). Falls back to 0 silently on any error
// so screens never crash because of a flaky network. Designed for the
// `BellBadge` component but reusable anywhere.

import { useEffect, useState, useRef } from 'react';
import { AppState } from 'react-native';
import { notificationsAPI } from './notificationsAPI';

const POLL_MS = 30000;

export function useUnreadNotifications(enabled = true) {
  const [count, setCount] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let mounted = true;
    const fetchCount = async () => {
      try {
        const r = await notificationsAPI.unread();
        const n = (r && (r.unread ?? r.count ?? r.total)) || 0;
        if (mounted) setCount(Number(n) || 0);
      } catch {
        // silent — leave previous value
      }
    };
    fetchCount();
    timerRef.current = setInterval(fetchCount, POLL_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') fetchCount();
    });
    return () => {
      mounted = false;
      clearInterval(timerRef.current);
      sub?.remove?.();
    };
  }, [enabled]);

  return count;
}
