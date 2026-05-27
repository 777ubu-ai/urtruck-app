import { useEffect, useRef } from 'react';
import { storage } from './storage';

// useDraft — лёгкий хук автосохранения состояния формы в локальный storage.
//
// Бизнес-контекст: водители часто теряют сеть на трассе или приложение
// уходит в фон/убивается ОС, пока они заполняют регистрацию. Спека
// (driver_onboarding) требует «мгновенно сохранять onChange и
// восстанавливать при перезапуске».
//
// API:
//   useDraft(key, values, setters, { enabled = true, debounceMs = 250 })
//   - key:     уникальный ключ драфта (например, 'draft_reg_step2')
//   - values:  объект {fieldName: currentValue} — текущее состояние
//   - setters: объект {fieldName: setter} — функции восстановления (опц.)
//   - enabled: можно отключить (например, после успешной отправки)
//
// Хук:
//   1) при mount читает драфт из storage и восстанавливает поля через setters
//   2) при изменении values пишет дебаунсом обратно в storage
//
// Очистка драфта — отдельный exported helper:
//   import { clearDraft } from '../utils/useDraft'; await clearDraft(key)

const PREFIX = 'ur_draft_';
const fullKey = (k) => `${PREFIX}${k}`;

export function useDraft(key, values, setters = {}, opts = {}) {
  const { enabled = true, debounceMs = 250 } = opts;
  const restoredRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled || restoredRef.current) return;
    let cancelled = false;
    (async () => {
      const raw = await storage.get(fullKey(key));
      if (cancelled || !raw) { restoredRef.current = true; return; }
      try {
        const draft = JSON.parse(raw);
        for (const k of Object.keys(setters)) {
          if (draft[k] !== undefined && draft[k] !== null && draft[k] !== '') {
            setters[k](draft[k]);
          }
        }
      } catch {}
      restoredRef.current = true;
    })();
    return () => { cancelled = true; };
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled || !restoredRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      storage.set(fullKey(key), JSON.stringify(values || {}));
    }, debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [key, enabled, JSON.stringify(values)]);
}

export async function clearDraft(key) {
  await storage.remove(fullKey(key));
}

export async function readDraft(key) {
  const raw = await storage.get(fullKey(key));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
