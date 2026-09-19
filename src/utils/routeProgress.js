const EARTH_RADIUS_M = 6371000;
const toRadians = value => value * Math.PI / 180;
const validPoint = p => Array.isArray(p) && p.length >= 2
  && p.slice(0, 2).every(v => v != null && String(v).trim() !== '' && Number.isFinite(Number(v)))
  && Math.abs(Number(p[0])) <= 90 && Math.abs(Number(p[1])) <= 180;
const vector = p => {
  const lat = toRadians(Number(p[0])), lon = toRadians(Number(p[1]));
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
};
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const angle = (a, b) => Math.atan2(norm(cross(a, b)), dot(a, b));

export const distanceBetweenPoints = (a, b) => validPoint(a) && validPoint(b)
  ? EARTH_RADIUS_M * angle(vector(a), vector(b)) : 0;

// Геометрия [lat, lon] получена от road provider. Проекция на каждый
// сегмент большой окружности не зависит от плотности вершин полилинии.
// Без истории движения развязку/петлю нельзя надёжно разрешить: вблизи
// нескольких далёких по пробегу участков возвращаем unknown, а не 100%.
export const routeProgress = (geometry, livePoint, { maxOffsetMeters = 100 } = {}) => {
  const unknown = (totalMeters, reason, offsetMeters = null) => ({
    totalMeters, passedMeters: null, remainingMeters: null, progressPercent: null,
    matched: false, reason, offsetMeters,
  });
  if (!Array.isArray(geometry) || geometry.length < 2 || !geometry.every(validPoint)) {
    return unknown(0, 'invalid_geometry');
  }
  const route = geometry.map(vector);
  const lengths = route.slice(1).map((p, i) => angle(route[i], p));
  const totalMeters = lengths.reduce((sum, v) => sum + v * EARTH_RADIUS_M, 0);
  if (totalMeters <= 0 || lengths.some(v => Math.PI - v < 1e-8)) return unknown(0, 'invalid_geometry');
  if (!validPoint(livePoint)) return unknown(totalMeters, 'no_location');
  const p = vector(livePoint), candidates = [];
  let before = 0;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i];
    if (length < 1e-12) continue;
    const a = route[i], b = route[i + 1];
    const tangent = b.map((v, j) => (v - Math.cos(length) * a[j]) / Math.sin(length));
    const along = Math.max(0, Math.min(length, Math.atan2(dot(p, tangent), dot(p, a))));
    const projected = a.map((v, j) => Math.cos(along) * v + Math.sin(along) * tangent[j]);
    candidates.push({ passed: before + along * EARTH_RADIUS_M, offset: angle(p, projected) * EARTH_RADIUS_M });
    before += length * EARTH_RADIUS_M;
  }
  candidates.sort((a, b) => a.offset - b.offset);
  const best = candidates[0];
  if (!best || best.offset > maxOffsetMeters) return unknown(totalMeters, 'off_route', best?.offset ?? null);
  // 25 м — допуск шума; 200 м вдоль маршрута отличают разные проезды
  // через одну развязку от соседних сегментов одного поворота.
  if (candidates.some(c => c.offset <= best.offset + 25 && Math.abs(c.passed - best.passed) > 200)) {
    return unknown(totalMeters, 'ambiguous', best.offset);
  }
  const passedMeters = Math.max(0, Math.min(totalMeters, best.passed));
  const remainingMeters = Math.max(0, totalMeters - passedMeters);
  const arrived = remainingMeters < 1 && best.offset <= 20;
  return {
    totalMeters, passedMeters, remainingMeters,
    progressPercent: arrived ? 100 : Math.min(99, Math.floor(100 * passedMeters / totalMeters)),
    matched: true, reason: null, offsetMeters: best.offset,
  };
};
