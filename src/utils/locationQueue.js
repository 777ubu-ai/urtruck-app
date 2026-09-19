// Отдельный атомарный ключ на измерение: параллельные JS runtimes не
// перезаписывают общий JSON-массив и не теряют чужие добавления/подтверждения.
export const LOCATION_SAMPLE_PREFIX = 'ur_bg_sample_v2:';
export const LOCATION_QUARANTINE_PREFIX = 'ur_bg_sample_quarantine_v2:';
export const LOCATION_RETRY_PREFIX = 'ur_bg_retry_v1:';
export const locationSampleId = (sample) => [sample.ownerId || '', sample.dealId, sample.capturedAt, sample.lat, sample.lng].join(':');

// Retry-After бывает количеством секунд или HTTP-датой. Некорректное
// значение не отменяет обычный backoff; верхняя граница ожидания — сутки.
export function locationRetryAfterMs(value, now) {
  if (value == null || String(value).trim() === '') return 0;
  const raw = String(value).trim();
  const delay = /^\d+(\.\d+)?$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - now;
  return Number.isFinite(delay) ? Math.max(0, Math.min(86400000, delay)) : 0;
}

export function createLocationQueue(store, { now = Date.now, random = Math.random } = {}) {
  const keyOf = (sample) => LOCATION_SAMPLE_PREFIX + locationSampleId(sample);
  return {
    async append(sample) {
      await store.set(keyOf(sample), JSON.stringify(sample));
    },
    async pending(dealId, ownerId = '') {
      const keys = (await store.keys()).filter((key) => key.startsWith(LOCATION_SAMPLE_PREFIX));
      const samples = [];
      for (const key of keys) {
        const raw = await store.get(key);
        if (raw == null) continue; // Другой runtime уже подтвердил эту точку.
        const sample = JSON.parse(raw);
        if (sample.dealId === dealId && (sample.ownerId || '') === ownerId) samples.push(sample);
      }
      return samples.sort((a, b) => a.capturedAt - b.capturedAt || locationSampleId(a).localeCompare(locationSampleId(b)));
    },
    async drain(dealId, post, stillAuthorized = async () => true, ownerId = '') {
      while (await stillAuthorized()) {
        // Время Unix ms фиксированной длины: сортировка ключей даёт FIFO.
        // Читаем только голову, а не все тела точек при каждом подтверждении.
        const keys = (await store.keys()).filter((key) => key.startsWith(LOCATION_SAMPLE_PREFIX + ownerId + ':' + dealId + ':')).sort();
        if (!keys.length) return;
        const raw = await store.get(keys[0]);
        if (raw == null) continue;
        const head = JSON.parse(raw);
        if (!head) return;
        const retryKey = LOCATION_RETRY_PREFIX + locationSampleId(head);
        const retry = JSON.parse(await store.get(retryKey) || 'null');
        const clock = now();
        // Состояние отдельно от sample: повторный append того же callback
        // не сбрасывает паузу. Новый JS runtime читает ту же дату повтора.
        if (retry?.nextAttemptAt > clock && retry.nextAttemptAt - clock <= 86400000) return;
        if (!await stillAuthorized()) return;
        let result;
        try { result = await post(head); } catch { result = false; }
        if (result?.quarantine) {
          await store.set(LOCATION_QUARANTINE_PREFIX + locationSampleId(head), JSON.stringify({ sample: head, status: result.quarantine }));
        } else if (result !== true) {
          const failures = Math.min(20, Math.max(0, Number(retry?.failures) || 0) + 1);
          const backoff = Math.min(300000, 30000 * 2 ** (failures - 1) * (0.8 + 0.4 * random()));
          const failedAt = now();
          await store.set(retryKey, JSON.stringify({ failures, nextAttemptAt: failedAt + Math.max(backoff, locationRetryAfterMs(result?.retryAfter, failedAt)) }));
          return;
        }
        await store.remove(keyOf(head));
        await store.remove(retryKey);
      }
    },
    async migrate(legacyKey, ownerId) {
      const raw = await store.get(legacyKey);
      if (!raw) return;
      const samples = JSON.parse(raw);
      if (!Array.isArray(samples)) throw new Error('GPS_QUEUE_INVALID');
      for (const sample of samples) await this.append({ ...sample, ownerId });
      // Старый ключ сохраняется как доказательство миграции. Маркер пишется
      // после всех записей, поэтому прерывание не теряет ни одну старую точку.
      await store.set(legacyKey + ':migrated', '1');
    },
  };
}
