// Отдельный атомарный ключ на измерение: параллельные JS runtimes не
// перезаписывают общий JSON-массив и не теряют чужие добавления/подтверждения.
export const LOCATION_SAMPLE_PREFIX = 'ur_bg_sample_v2:';
export const LOCATION_QUARANTINE_PREFIX = 'ur_bg_sample_quarantine_v2:';
export const locationSampleId = (sample) => [sample.ownerId || '', sample.dealId, sample.capturedAt, sample.lat, sample.lng].join(':');

export function createLocationQueue(store) {
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
        const result = await post(head);
        if (result?.quarantine) {
          await store.set(LOCATION_QUARANTINE_PREFIX + locationSampleId(head), JSON.stringify({ sample: head, status: result.quarantine }));
        } else if (result !== true) return;
        await store.remove(keyOf(head));
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
